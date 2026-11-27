from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Response
from app.deps import current_user, template_manager
from app.models.user import User
from app.schemas.template import TemplateSummary, FieldSaveRequest
from app.services import template_service

router = APIRouter()


@router.post("/", response_model=TemplateSummary, status_code=201)
async def upload_template(
    name: str = Form(...),
    template_key: str = Form(...),
    description: str = Form(""),
    created_by: str = Form("staff"),  # ignored — set from the signed-in user
    file: UploadFile = File(...),
    user: User = Depends(template_manager),
):
    if not file.filename or not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    try:
        return await template_service.create_template(
            name=name,
            template_key=template_key,
            description=description,
            created_by=user.name,
            pdf_bytes=pdf_bytes,
            filename=file.filename,
        )
    except ValueError as e:  # bad PDF or Documenso rejected it
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[TemplateSummary])
async def list_templates(user: User = Depends(current_user)):
    return await template_service.list_templates()


@router.get("/{template_id}/pdf")
async def get_template_pdf(template_id: str, user: User = Depends(current_user)):
    """The template's PDF, served through the backend so the editor/preview have a stable URL."""
    try:
        data = await template_service.get_pdf_bytes(template_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return Response(content=data, media_type="application/pdf", headers={"Cache-Control": "private, max-age=300"})


@router.get("/{template_id}/pdf-url")
async def get_template_pdf_url(template_id: str, user: User = Depends(current_user)):
    try:
        url = await template_service.get_pdf_url(template_id)
        return {"url": url}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{template_id}/fields", response_model=TemplateSummary)
async def save_template_fields(template_id: str, body: FieldSaveRequest, user: User = Depends(template_manager)):
    try:
        return await template_service.save_template_fields(
            template_id, [f.model_dump(exclude_none=True) for f in body.fields]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{template_id}", status_code=204)
async def deactivate_template(template_id: str, user: User = Depends(template_manager)):
    await template_service.deactivate_template(template_id)
