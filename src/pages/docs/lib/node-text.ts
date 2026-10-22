import { isValidElement, type ReactNode } from "react";

/**
 * The plain text of rendered children (strings, numbers, nested elements' children), e.g. a
 * Markdown heading that contains a `<Kbd>` or `**bold**` part. Booleans and null render nothing.
 */
export function nodeText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}
