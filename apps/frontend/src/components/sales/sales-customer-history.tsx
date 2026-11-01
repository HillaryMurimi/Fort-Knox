"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button, Alert, StatusBadge } from "@/components/ui";
import { salesIdentityClient } from "@/lib/data/sales-identity";
export function SalesCustomerHistory({
  id,
  kind,
  initialCursor,
}: {
  id: string;
  kind: "ACTIVITIES" | "MEETINGS";
  initialCursor?: string | null | undefined;
}) {
  const auth = useAuth();
  const permission =
    kind === "ACTIVITIES" ? "sales.notes.read" : "sales.meetings.read";
  const allowed =
    !auth.isDevMode &&
    (auth.roles.includes("SUPER_ADMIN") ||
      auth.memberships.some((m) => m.permissions.includes(permission)));
  const access =
    auth.user?._id +
    ":" +
    auth.memberships.map((m) => m.permissions.join(",")).join("|");
  const pages = useInfiniteQuery({
    queryKey: ["sales-history", access, id, kind, initialCursor],
    queryFn: ({ pageParam }) =>
      salesIdentityClient.history(id, kind, pageParam),
    initialPageParam: initialCursor ?? "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: false,
  });
  if (!allowed || !initialCursor) return null;
  return (
    <div className="space-y-4 border-t border-border pt-4">
      {!pages.error &&
        pages.data?.pages
          .flatMap((page) => page.items)
          .map((item) => (
            <article
              key={item._id}
              className="space-y-2 rounded-lg border border-border p-3"
            >
              <p className="text-xs text-muted-foreground">
                {item.kind?.replaceAll(".", " ") ?? item.type} ·{" "}
                {new Date(
                  item.sourceOccurredAt ??
                    item.startsAt ??
                    item.createdAt ??
                    "",
                ).toLocaleString()}
              </p>
              {item.status && (
                <StatusBadge status={item.status} domain="sales" />
              )}
              {[item.text, item.description, item.outcome]
                .filter(Boolean)
                .map((text, index) => (
                  <p
                    key={index}
                    className="whitespace-pre-wrap break-words text-sm"
                  >
                    {text}
                  </p>
                ))}
            </article>
          ))}
      {pages.error && <Alert>{pages.error.message}</Alert>}
      {(!pages.data || pages.hasNextPage) && (
        <Button
          variant="outline"
          disabled={pages.isFetching}
          onClick={() => void pages.fetchNextPage()}
        >
          {pages.isFetching
            ? "Loading earlier history…"
            : kind === "ACTIVITIES"
              ? "Load earlier activity"
              : "Load earlier meetings"}
        </Button>
      )}
      {pages.data && !pages.hasNextPage && (
        <p className="text-xs text-muted-foreground">
          End of retained history.
        </p>
      )}
    </div>
  );
}
