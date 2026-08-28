import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Root route serves two audiences from one page:
 *  - anyone, logged in or not, can see what's publicly listed and who
 *    currently has it ("kiske paas hain") — that's the whole point of a
 *    shareable catalog;
 *  - a signed-in user additionally gets their own strip (active loans,
 *    nearby-first ordering) above the public catalog.
 * Item detail pages (/i/[slug]) are the individual public share links;
 * this page is the full public directory those links are a shortcut past.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: items } = await supabase
    .from("items")
    .select(
      `id, title, category, photo_urls, estimated_value_inr, status, share_slug,
       owner:profiles!items_owner_id_fkey(name, address_display),
       item_units(current_holder:profiles(name, address_display))`
    )
    .eq("visibility", "COHORT")
    .neq("status", "RETIRED")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold leading-none">Handoff</h1>
            <p className="text-xs text-muted-foreground">Kiske paas hai?</p>
          </div>
          {user ? (
            <Link href="/me">
              <Button size="sm" variant="outline">
                Me
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          )}
        </div>
      </header>

      <section className="flex-1 space-y-3 px-4 py-4">
        {!user && (
          <Card className="bg-secondary/60 p-3 text-xs text-muted-foreground">
            Browsing publicly — sign in with your ISB email to borrow, lend, or list something.
          </Card>
        )}

        {(!items || items.length === 0) && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Nothing listed yet.{" "}
            {user ? (
              <Link href="/add" className="text-primary underline">
                Add the first item
              </Link>
            ) : (
              "Sign in to add the first item."
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {items?.map((item: any) => {
            const holder = item.item_units?.find((u: any) => u.current_holder)?.current_holder;
            const withWhom = item.status === "AVAILABLE" ? item.owner : holder ?? item.owner;
            return (
              <Link key={item.id} href={`/i/${item.share_slug}`}>
                <Card className="overflow-hidden">
                  <div className="aspect-square w-full bg-secondary">
                    {item.photo_urls?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.photo_urls[0]}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="space-y-1 p-2.5">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <div className="flex items-center justify-between">
                      <StatusBadge status={item.status} />
                      <span className="text-[11px] text-muted-foreground">
                        {withWhom?.address_display ?? ""}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {user && (
        <Link
          href="/add"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg"
        >
          + Add an item
        </Link>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "AVAILABLE") return <Badge variant="success">Available</Badge>;
  if (status === "ON_LOAN") return <Badge variant="warning">On loan</Badge>;
  if (status === "LOST") return <Badge variant="destructive">Lost</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}
