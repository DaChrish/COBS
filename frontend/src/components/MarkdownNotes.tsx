import ReactMarkdown from "react-markdown";
import { TypographyStylesProvider } from "@mantine/core";

export function MarkdownNotes({ children }: { children: string }) {
  if (!children) return null;
  return (
    <TypographyStylesProvider style={{ fontSize: "0.875rem" }}>
      <ReactMarkdown
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </TypographyStylesProvider>
  );
}
