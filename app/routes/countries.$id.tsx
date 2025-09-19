import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, useParams } from "@remix-run/react";
import { db } from "~/lib/db.server";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Button } from "~/components/ui/button";

export async function loader({ params }: LoaderFunctionArgs) {
  const country = await db.country.findUnique({
    where: { id: params.id },
    include: { 
      feeds: { orderBy: { order: 'asc' } },
      newsSources: true,
      keywords: true,
      governmentMessaging: true,
      leadershipMessaging: true,
      diplomaticPresence: true,
      embassyPresence: true
    }
  });

  if (!country) {
    throw new Response("Not Found", { status: 404 });
  }

  return { country };
}

export default function CountryLayout() {
  const { country } = useLoaderData<typeof loader>();
  const location = useLocation();
  const { id } = useParams();

  const tabs = [
    { name: 'Overview', href: `/countries/${id}` },
    { name: 'Feeds', href: `/countries/${id}/feeds` },
    { name: 'Profile', href: `/countries/${id}/profile` },
    { name: 'Reports', href: `/countries/${id}/reports` },
    { name: 'News Sources', href: `/countries/${id}/news-sources` },
    { name: 'Influencers', href: `/countries/${id}/influencers` },
    { name: 'Keywords', href: `/countries/${id}/keywords` },
    { name: 'Government Messaging', href: `/countries/${id}/government-messaging` },
    { name: 'Leadership Messaging', href: `/countries/${id}/leadership-messaging` },
    { name: 'Ambassador', href: `/countries/${id}/diplomatic-presence` },
    { name: 'Embassy', href: `/countries/${id}/embassy-presence` },
    // { name: 'US Mentions Sources', href: `/countries/${id}/us-mentions-sources` },
    { name: 'US Mentions Keywords', href: `/countries/${id}/us-mentions-keywords` },
  ];

  const currentTab = tabs.find(tab => 
    location.pathname === tab.href || 
    (tab.href !== `/countries/${id}` && location.pathname.startsWith(tab.href))
  ) || tabs[0];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{country.name}</h1>
          {!country.published && (
            <span className="px-2 py-1 text-sm bg-yellow-100 text-yellow-800 rounded">
              Draft
            </span>
          )}
        </div>
        <Button variant="secondary" asChild>
          <Link to="/countries">Back to Countries</Link>
        </Button>
      </div>

      <Tabs value={currentTab.name.toLowerCase()} className="space-y-6">
        <TabsList>
          <TabsTrigger value="country" asChild>
            <Link to={`/countries/${country.id}`}>Country</Link>
          </TabsTrigger>
          <TabsTrigger value="feeds" asChild>
            <Link to={`/countries/${country.id}/feeds`}>Feeds</Link>
          </TabsTrigger>
          <TabsTrigger value="profile" asChild>
            <Link to={`/countries/${country.id}/profile`}>Profile</Link>
          </TabsTrigger>
          <TabsTrigger value="reports" asChild>
            <Link to={`/countries/${country.id}/reports`}>Reports</Link>
          </TabsTrigger>
          <TabsTrigger value="news sources" asChild>
            <Link to={`/countries/${country.id}/news-sources`}>News Sources</Link>
          </TabsTrigger>
          <TabsTrigger value="influencers" asChild>
            <Link to={`/countries/${country.id}/influencers`}>Influencers</Link>
          </TabsTrigger>
          <TabsTrigger value="keywords" asChild>
            <Link to={`/countries/${country.id}/keywords`}>Keywords</Link>
          </TabsTrigger>
          <TabsTrigger value="government messaging" asChild>
            <Link to={`/countries/${country.id}/government-messaging`}>Government Messaging</Link>
          </TabsTrigger>
          <TabsTrigger value="leadership messaging" asChild>
            <Link to={`/countries/${country.id}/leadership-messaging`}>Leadership Messaging</Link>
          </TabsTrigger>
          <TabsTrigger value="diplomatic presence" asChild>
            <Link to={`/countries/${country.id}/diplomatic-presence`}>Ambassador</Link>
          </TabsTrigger>
          <TabsTrigger value="embassy presence" asChild>
            <Link to={`/countries/${country.id}/embassy-presence`}>Embassy</Link>
          </TabsTrigger>
          {/* <TabsTrigger value="us mentions sources" asChild>
            <Link to={`/countries/${country.id}/us-mentions-sources`}>US Mentions Sources</Link>
          </TabsTrigger> */}
          <TabsTrigger value="us mentions keywords" asChild>
            <Link to={`/countries/${country.id}/us-mentions-keywords`}>US Mentions Keywords</Link>
          </TabsTrigger>
        </TabsList>

        <Outlet context={{ country }} />
      </Tabs>
    </div>
  );
} 