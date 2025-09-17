# import sys
# import json
# import requests
# from bs4 import BeautifulSoup
# from datetime import datetime

# category_rules = {
#     "Embassy Mention": ["embassy", "consulate"],
#     "Ambassador Mention": ["ambassador"],
#     "Daily Summary": ["summary", "daily report", "roundup"],
#     "US Mentions": ["US", "USA", "America", "Washington"],
#     "Government Messaging": ["government", "ministry", "official statement"],
#     "Leadership Messaging": ["president", "prime minister", "chancellor", "leader"],
#     "Breaking News": ["breaking", "urgent", "just in"],
#     "Main Feed": ["taliban", "united states", "terrorism","china"]
# }


# def scrape_articles(url: str):
#     """Scrape titles, links, timestamps, and maybe images"""
#     try:
#         response = requests.get(url, timeout=10)
#         response.raise_for_status()
#     except Exception as e:
#         return {"error": f"Error fetching {url}: {e}"}

#     soup = BeautifulSoup(response.text, "html.parser")
#     articles = []

#     for a in soup.find_all("a", href=True):
#         title = a.get_text(strip=True)
#         link = a["href"]

#         if title and len(title.split()) > 3:
#             if not link.startswith("http"):
#                 link = url.rstrip("/") + "/" + link.lstrip("/")

#             pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")

#             # Try to grab image near the <a>
#             img_url = None
#             parent = a.find_parent()
#             if parent:
#                 img = parent.find("img")
#                 if img and img.has_attr("src"):
#                     img_url = img["src"]

#             article = {
#                 "title": title,
#                 "description": title,
#                 "link": link,
#                 "guid": {"isPermaLink": True, "value": link},
#                 "dc:creator": "scraper",
#                 "pubDate": pub_time,
#             }
#             if img_url:
#                 article["media:content"] = {"url": img_url}

#             articles.append(article)

#     return {"articles": articles}


# def filter_by_feed_type(articles, feed_type: str):
#     """Filter articles based on feed type keywords"""
#     if feed_type == "Main Feed":
#         return articles
#     keywords = category_rules.get(feed_type, [])
#     return [art for art in articles if any(word.lower() in art["title"].lower() for word in keywords)]


# if __name__ == "__main__":
#     if len(sys.argv) < 3:
#         print(json.dumps({"error": "Usage: python scraper.py <url> <feed_type>"}))
#         sys.exit(1)

#     url = sys.argv[1]
#     feed_type = sys.argv[2]

#     result = scrape_articles(url)
#     if "error" in result:
#         print(json.dumps(result))
#         sys.exit(1)

#     filtered = filter_by_feed_type(result["articles"], feed_type)

#     # Build channel object
#     rss_json = {
#         "channel": {
#             "title": f"{feed_type} Feed",
#             "description": f"Scraped {feed_type} articles",
#             "link": url,
#             # channel image: take first article image if available
#             "image": None,
#             "generator": "Custom Python Scraper",
#             "lastBuildDate": datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT"),
#             "language": "en",
#             "items": filtered
#         }
#     }

#     # If any item has media:content, use the first one for channel.image
#     for item in filtered:
#         if "media:content" in item:
#             rss_json["channel"]["image"] = {
#                 "url": item["media:content"]["url"],
#                 "title": f"{feed_type} Feed",
#                 "link": url
#             }
#             break

#     print(json.dumps(rss_json, ensure_ascii=False, indent=2))



############################################

import sys
import json
import requests
import cloudscraper
from bs4 import BeautifulSoup
from datetime import datetime

# 🔹 Category keywords for filtering
category_rules = {
    "Embassy Mention": ["embassy", "consulate"],
    "Ambassador Mention": ["ambassador"],
    "Daily Summary": ["summary", "daily report", "roundup"],
    "US Mentions": ["US", "USA", "America", "Washington"],
    "Government Messaging": ["government", "ministry", "official statement"],
    "Leadership Messaging": ["president", "prime minister", "chancellor", "leader"],
    "Breaking News": ["breaking", "urgent", "just in"],
    "Main Feed": ["taliban", "united states", "terrorism", "china"]
}


def fetch_page(url: str):
    """Fetch page content, try cloudscraper first, then requests"""
    try:
        scraper = cloudscraper.create_scraper()
        response = scraper.get(url, timeout=10)
        response.raise_for_status()
        return response.text
    except Exception as e1:
        print(f"[WARN] cloudscraper failed: {e1}, falling back to requests", file=sys.stderr)
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.text
        except Exception as e2:
            print(f"[ERROR] requests also failed: {e2}", file=sys.stderr)
            return None


def scrape_articles(url: str):
    """Scrape titles, links, timestamps, and maybe images"""
    html = fetch_page(url)
    if not html:
        return {"error": f"Failed to fetch {url}"}

    soup = BeautifulSoup(html, "html.parser")
    articles = []

    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        link = a["href"]

        if title and len(title.split()) > 3:
            if not link.startswith("http"):
                link = url.rstrip("/") + "/" + link.lstrip("/")

            pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")

            # Try to grab image near the <a>
            img_url = None
            parent = a.find_parent()
            if parent:
                img = parent.find("img")
                if img and img.has_attr("src"):
                    img_url = img["src"]

            article = {
                "title": title,
                "description": title,
                "link": link,
                "guid": {"isPermaLink": True, "value": link},
                "dc:creator": "scraper",
                "pubDate": pub_time,
            }
            if img_url:
                article["media:content"] = {"url": img_url}

            articles.append(article)

    return {"articles": articles}


def filter_by_feed_type(articles, feed_type: str):
    """Filter articles based on feed type keywords"""
    if feed_type == "Main Feed":
        return articles
    keywords = category_rules.get(feed_type, [])
    return [art for art in articles if any(word.lower() in art["title"].lower() for word in keywords)]


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python scraper.py <url> <feed_type>"}))
        sys.exit(1)

    url = sys.argv[1]
    feed_type = sys.argv[2]

    result = scrape_articles(url)
    if "error" in result:
        print(json.dumps(result))
        sys.exit(1)

    filtered = filter_by_feed_type(result["articles"], feed_type)

    # Build channel object
    rss_json = {
        "channel": {
            "title": f"{feed_type} Feed",
            "description": f"Scraped {feed_type} articles",
            "link": url,
            "image": None,
            "generator": "Custom Python Scraper",
            "lastBuildDate": datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT"),
            "language": "en",
            "items": filtered
        }
    }

    # If any item has media:content, use the first one for channel.image
    for item in filtered:
        if "media:content" in item:
            rss_json["channel"]["image"] = {
                "url": item["media:content"]["url"],
                "title": f"{feed_type} Feed",
                "link": url
            }
            break

    print(json.dumps(rss_json, ensure_ascii=False, indent=2))
