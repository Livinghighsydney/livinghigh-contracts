"""Seed the database. Safe to run any number of times.

    cd backend
    .venv/Scripts/python seed.py                    # create/repair the super admin
    .venv/Scripts/python seed.py --reset-password   # also reset the super admin's password from .env

Seeds:
  1. Tables + column migrations (same as app start-up).
  2. Super admin / account owner (Admin role, can't be demoted or deactivated):
       SEED_ADMIN_EMAIL     default contracts@livinghigh.com.au
       SEED_ADMIN_NAME      default "Living High Admin"
       SEED_ADMIN_PASSWORD  required in .env — never hard-coded here
  3. Contracts created before staff login existed get the super admin as owner.
"""
import argparse
import asyncio
import sys

from fastapi import FastAPI
from tortoise.contrib.fastapi import RegisterTortoise

from app.config import settings
from app.database import TORTOISE_ORM
from app.main import run_migrations
from app.models.contract import Contract
from app.models.user import Role, User
from app.utils.security import hash_password, password_problem


async def seed(reset_password: bool) -> None:
    email = settings.seed_admin_email.strip().lower()
    password = settings.seed_admin_password
    if not password:
        sys.exit("SEED_ADMIN_PASSWORD is not set in .env — add it and run again.")
    if problem := password_problem(password):
        sys.exit(f"SEED_ADMIN_PASSWORD is too weak: {problem}")

    # Use the app's RegisterTortoise setup (project rule: no manual Tortoise.init).
    async with RegisterTortoise(FastAPI(), config=TORTOISE_ORM):
        await run_migrations()
        print("OK  tables and migrations")

        admin = await User.get_or_none(email=email)
        if admin is None:
            admin = await User.create(
                email=email, name=settings.seed_admin_name, role=Role.ADMIN,
                password_hash=hash_password(password), is_owner=True, is_active=True,
            )
            print(f"OK  super admin created: {email}")
        else:
            admin.role, admin.is_owner, admin.is_active = Role.ADMIN, True, True
            fields = ["role", "is_owner", "is_active", "updated_at"]
            if reset_password:
                admin.password_hash = hash_password(password)
                fields.append("password_hash")
            await admin.save(update_fields=fields)
            print(f"OK  super admin already existed: {email} (role/owner/active ensured"
                  f"{', password reset' if reset_password else ''})")

        moved = await Contract.filter(owner_id=None).update(owner_id=admin.id)
        print(f"OK  {moved} existing contract(s) assigned to the super admin")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the Living High contracts database.")
    parser.add_argument("--reset-password", action="store_true", help="reset the super admin password from .env")
    asyncio.run(seed(parser.parse_args().reset_password))
