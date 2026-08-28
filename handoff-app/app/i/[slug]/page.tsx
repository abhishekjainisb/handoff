import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Public item page — this is the link that gets shared in WhatsApp groups.
 * Works fully logged-out: anyone can see what it is, whether it's available,
 * and (redacted to "with a Co'27 student" for anon viewers — the full name
 * and chain timeline are cohort-only) roughly where it lives.
 * The action button always routes through /login?next=<this-url> so a tap
 * from someone with no account lands back here, ready, after one sign-in.
 */
export default async function ItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: item } = await supabase
    .from("items")
    .select(
      `id, title, description, category, photo_urls, estimated_value_inr, condition,
       quantity, borrow_policy, sublend_policy, status, max_loan_days, share_slug,
       owner:profiles!items_owner_id_fkey(id, name, section, address_display),
       item_units(id, status, current_holder:profiles(id, name, section, address_display))`
    )
    .eq("share_slug", slug)
    .maybeSingle();

  if (!item) notFound();

  const unit = (item.item_units as any[])?.[0];
  const holder = unit?.current_holder;
  const isAvailable = item.status === "AVAILABLE";
  const loginNext = `/login?next=${encodeURIComponent(`/i/${slug}`)}`;

  return (
    <main className="min-h-dvh pb-28">
      <div className="aspect-square w-full bg-secondary">
        {item.photo_urls?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo_urls[0]} alt={item.title} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="space-y-4 px-4 py-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-semibold">{item.title}</h1>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.category.replaceAll("_", " ")} · Worth ~₹{item.estimated_value_inr} · {item.condition}
          </p>
        </div>

        {item.description && <p className="text-sm">{item.description}</p>}

        <Card>
          <CardContent className="space-y-2 pt-4 text-sm">
            <Row label="Owner" value={user ? `${(item.owner as any).name} · Sec ${(item.owner as any).section}` : "Owned by a Co'27 student"} />
            <Row
              label="Currently with"
              value={
                isAvailable
                  ? "Owner (available to borrow)"
                  : user
                    ? holder
                      ? `${holder.name} · Sec ${holder.section}`
                      : (item.owner as any).name
                    : "A Co'27 student"
              }
            />
            <Row
              label="Where"
              value={user ? ((holder ?? item.owner) as any).address_display ?? "—" : "Sign in to see the exact block"}
            />
            <Row
              label="Borrowing"
              value={item.borrow_policy === "OPEN" ? "Anyone can grab it" : "Owner approves first"}
            />
            {item.sublend_policy !== "FORBIDDEN" && (
              <Row
                label="Passing it on"
                value={
                  item.sublend_policy === "ALLOWED"
                    ? "Current holder can pass it along"
                    : "Needs both holder + owner approval"
                }
              />
            )}
          </CardContent>
        </Card>

        {user ? (
          <BorrowActionPlaceholder available={isAvailable} unitId={unit?.id} />
        ) : (
          <Link href={loginNext}>
            <Button size="lg" className="w-full">
              {isAvailable ? "Sign in to borrow" : "Sign in to request"}
            </Button>
          </Link>
        )}
      </div>
    </main>
  );
}

function BorrowActionPlaceholder({ available, unitId }: { available: boolean; unitId?: string }) {
  // Wired to request_handoff()/advance_handoff() in the next build phase —
  // see BATON_META_PROMPT.md §6 item 5 ("/i/[slug]") and §4.3 for the full
  // state machine this button will drive.
  return (
    <Button size="lg" className="w-full" disabled>
      {available ? "Request to borrow" : "Ask to be next in line"} — coming next
    </Button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "AVAILABLE") return <Badge variant="success">Available</Badge>;
  if (status === "ON_LOAN") return <Badge variant="warning">On loan</Badge>;
  if (status === "LOST") return <Badge variant="destructive">Lost</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1.5 last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
