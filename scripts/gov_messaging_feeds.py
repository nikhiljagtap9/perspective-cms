import asyncio, datetime, json, traceback
from prisma import Prisma
from common_feeds import get_tweets, save_feed_log, API_HITS

TARGET_COUNTRIES = [
    "India", 
    "China", 
    "Saudi Arabia", 
    "Cameroon", 
    "Israel", 
    "Qatar", 
    "Belarus", 
    "Iraq"
    ]
FEED_TYPE = "GOVERNMENT_MESSAGING"

async def scrape_country_handles(db, country, handles):
    all_tweets = []
    for handle in handles:
        tweets = await get_tweets(db, handle, FEED_TYPE, 100,mode="self")
        # all_tweets.extend(tweets)
        if tweets:  # only extend if not empty
            all_tweets.extend(tweets)

    all_tweets.sort(key=lambda x: x["pubDate"], reverse=True)
    status = "success" if all_tweets else "empty"

    rss_json = {
        "channel": {
            "title": f"{country.name} {FEED_TYPE.replace('_', ' ').title()} Feed",
            "description": f"Scraped Twitter feeds for {country.name}",
            "link": "https://twitter.com/",
            "items": all_tweets,
            "meta": {"status": status, "tweet_count": len(all_tweets)},
        }
    }

    saved_row = await db.scrapperdata.find_first(where={"country_id": country.id, "feed_type": FEED_TYPE})
    if saved_row:
        await db.scrapperdata.update(where={"id": saved_row.id}, data={"content": json.dumps(rss_json), "updated_at": datetime.datetime.now()})
    else:
        await db.scrapperdata.create(data={"feed_type": FEED_TYPE, "country_id": country.id, "content": json.dumps(rss_json)})

    # await save_feed_log(
    #     db,
    #     FEED_TYPE,
    #     f"scrapperdata/{FEED_TYPE}",
    #     {"message": f"[{country.name}] saved {len(all_tweets)} tweets"},
    #     status
    # )
    return len(all_tweets)

async def main():
    db = Prisma(); await db.connect()
    total = 0
    for cname in TARGET_COUNTRIES:
        country = await db.country.find_first(where={"name": cname})
        if not country: continue
        handles = [g.handle for g in await db.governmentmessaging.find_many(where={"countryId": country.id}) if g.handle]
        if handles: total += await scrape_country_handles(db, country, handles)
    # await save_feed_log(
    #     db,
    #     FEED_TYPE,
    #     "system",
    #     {"message": f"{FEED_TYPE} TOTAL={total}, API_HITS={API_HITS}"},
    #     "success"
    # )
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
