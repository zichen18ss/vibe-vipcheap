import snapshots from "@/lib/snapshots.json";

type SnapshotKey = keyof typeof snapshots;

export function MirrorPage({ pageKey }: { pageKey: SnapshotKey }) {
  return <main className="flex-1" dangerouslySetInnerHTML={{ __html: snapshots[pageKey] }} />;
}
