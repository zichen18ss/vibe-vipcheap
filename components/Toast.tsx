"use client";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="mirror-toast" role="status">{message}</div>;
}
