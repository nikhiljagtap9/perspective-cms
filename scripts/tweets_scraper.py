# tweets_scraper_log.py
# Requires: pip install playwright
# Then: playwright install


# How it works
# Opens the Twitter profile page with Playwright.
# Waits 5 seconds for tweets to load.
# Extracts the first limit tweets (div[lang]).
# Writes them into a file called tweets.log.


# from playwright.sync_api import sync_playwright

# def get_tweets(username, limit=5, logfile="tweets.log"):
#     url = f"https://twitter.com/{username}"
#     with sync_playwright() as p:
#         browser = p.chromium.launch(headless=True)
#         page = browser.new_page()
#         page.goto(url)
#         page.wait_for_timeout(5000)  # wait for tweets to load

#         tweets = page.query_selector_all("article")
#         with open(logfile, "a", encoding="utf-8") as f:
#             f.write(f"\nTweets from @{username}:\n")
#             for i, tweet in enumerate(tweets[:limit]):
#                 # Tweet text
#                 text_elem = tweet.query_selector("div[lang]")
#                 text = text_elem.inner_text().replace("\n", " ") if text_elem else "[No text]"

#                 # Date/time
#                 time_elem = tweet.query_selector("time")
#                 date_time = time_elem.get_attribute("datetime") if time_elem else "[No timestamp]"

#                 # Images
#                 img_elems = tweet.query_selector_all("img")
#                 image_urls = []
#                 for img in img_elems:
#                     src = img.get_attribute("src")
#                     # Filter out profile/avatar images
#                     if src and "profile_images" not in src and "emoji" not in src:
#                         image_urls.append(src)

#                 # Write to log
#                 f.write(f"\n{i+1}. [{date_time}] {text}\n")
#                 if image_urls:
#                     f.write("   Images:\n")
#                     for img_url in image_urls:
#                         f.write(f"     - {img_url}\n")
#             f.write("-" * 40 + "\n")

#         browser.close()

# if __name__ == "__main__":
#     logfile = "tweets.log"
#     # Clear old log file at start
#     open(logfile, "w", encoding="utf-8").close()

#     for user in ["amitmalviya", "sagarikaghose"]:
#         get_tweets(user, limit=5, logfile=logfile)

#     print(f"✅ Tweets with date, time, and images saved in {logfile}")





# tweets_rss_log.py
# Requires: pip install playwright
# Then: playwright install

from playwright.sync_api import sync_playwright
import datetime
import html

def get_tweets(username, limit=5):
    url = f"https://twitter.com/{username}"
    tweets_data = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url)
        page.wait_for_timeout(5000)  # wait for tweets to load

        # Scroll to load more tweets
        for _ in range(3):
            page.mouse.wheel(0, 2000)
            page.wait_for_timeout(2000)

        tweets = page.query_selector_all("article")
        for i, tweet in enumerate(tweets[:limit]):
            # Tweet text
            text_elem = tweet.query_selector("div[lang]")
            text = text_elem.inner_text().replace("\n", " ") if text_elem else "[No text]"

            # Date/time
            time_elem = tweet.query_selector("time")
            date_time = time_elem.get_attribute("datetime") if time_elem else datetime.datetime.utcnow().isoformat()

            # Tweet link
            link_elem = tweet.query_selector("a time")
            link = ""
            if link_elem:
                link = link_elem.evaluate("el => el.parentElement.href")

            # Images
            img_elems = tweet.query_selector_all("img")
            image_urls = []
            for img in img_elems:
                src = img.get_attribute("src")
                if src and "profile_images" not in src and "emoji" not in src:
                    image_urls.append(src)

            tweets_data.append({
                "title": text[:50] + "..." if len(text) > 50 else text,
                "link": link if link else url,
                "pubDate": date_time,
                "description": text,
                "images": image_urls
            })

        browser.close()

    return tweets_data


def make_rss(username, tweets):
    rss_content = f'''<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
<title>@{username} Tweets</title>
<link>https://twitter.com/{username}</link>
<description>Latest tweets from @{username}</description>
'''

    for t in tweets:
        rss_content += f'''
<item>
  <title>{html.escape(t["title"])}</title>
  <link>{t["link"]}</link>
  <pubDate>{t["pubDate"]}</pubDate>
  <description><![CDATA[{t["description"]}]]></description>'''

        # Add images as enclosures
        for img_url in t["images"]:
            rss_content += f'\n  <enclosure url="{img_url}" type="image/jpeg" />'

        rss_content += "\n</item>\n"

    rss_content += '''
</channel>
</rss>
'''
    return rss_content


if __name__ == "__main__":
    username = "RailMinIndia"   # change this
    tweets = get_tweets(username, limit=5)
    rss_xml = make_rss(username, tweets)

    logfile = "tweets.log"
    with open(logfile, "w", encoding="utf-8") as f:
        f.write(rss_xml)

    print(f"✅ RSS feed with tweets (and images) saved to {logfile}")



