import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export default function Card({ hover, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-4 ${hover ? "hover:bg-card-hover transition-colors cursor-pointer" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
