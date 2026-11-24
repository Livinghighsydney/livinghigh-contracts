type Color = "gray" | "blue" | "green" | "yellow" | "red";

interface Props {
  children: React.ReactNode;
  color?: Color;
}

const colors: Record<Color, string> = {
  gray:   "bg-gray-100 text-gray-700",
  blue:   "bg-blue-100 text-blue-700",
  green:  "bg-green-100 text-green-700",
  yellow: "bg-yellow-100 text-yellow-700",
  red:    "bg-red-100 text-red-700",
};

export function Badge({ children, color = "gray" }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}
