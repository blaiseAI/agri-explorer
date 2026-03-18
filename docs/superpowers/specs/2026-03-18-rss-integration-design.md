# RSS News Integration Specification

## 1. Problem Statement
Provide real-time market signals right where users are most engaged. The Country Page currently shows static, historical macro quantitative data (FAOSTAT/World Bank). Adding contextual, live news intelligence (e.g., "Uganda + agriculture + investment") directly bridges quantitative metrics with real-world, actionable context for investors.

## 2. Approach: Server-Side Parsing & Caching
We are proceeding with an Express-backed architecture rather than client-side proxies.

### 2.1 Why Server-Side?
- **Rate Limit Resilience**: By caching centrally, 10,000 visitors hitting the "Uganda" page only result in ~2 requests to Google News per hour, ensuring we never run afoul of IP rate limits.
- **CORS Mitigation**: Prevents browser security policy clashes.
- **Payload Optimization**: We handle the heavy XML parsing on the backend, only sending a lightweight JSON array to the client.

## 3. Architecture & Data Flow

### 3.1 Backend (`server/routes.ts`)
- **Dependency**: Add `rss-parser` to parse XML to JSON.
- **Endpoint**: `GET /api/news/:query`
  - Fetches from: `https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en`
  - Parses out items: `title`, `link`, `source` (or `publisher`), and `pubDate`.
- **Caching Mechanism**:
  - Implement a basic in-memory `Map`.
  - Cache Key: the `query` string.
  - TTL (Time to Live): 30 minutes. Let's expire cached entries strictly.
- **Error Handling**: If Google News fails or times out, the backend gracefully catches the error and returns a `500` or an empty array `[]` so the frontend doesn't crash.

### 3.2 Frontend (`client/src/components/NewsFeed.tsx`)
- **Props**:
  - `query` (string) — The exact search term (e.g. `"Uganda agriculture investment"`).
  - `limit` (number, default: `3`) — The max items to show.
- **Data Fetching**:
  - Uses `@tanstack/react-query` to fetch `/api/news/${query}`.
- **States**:
  - **Loading (`isPending`)**: Displays a clean skeleton matching the list layout.
  - **Error (`isError`)**: Either hides silently or shows a very subtle "News currently unavailable" state to preserve layout integrity without drawing attention.
  - **Success**: Renders a list layout.
- **UI Structure**:
  - Header: e.g. "Latest News — Uganda"
  - Items: Bulleted or card list showing the article title, publisher, and relative time (e.g., "2h ago").
  - Footer: "View all news →" link which opens `https://news.google.com/search?q={query}` in a new tab (`_blank`).

### 3.3 Location
Mounted inside `client/src/pages/CountryView.tsx` (or whatever the exact parent component is named). Positioned directly underneath the "Top Crops" summary cards, providing immediate context before jumping into detailed, specific crop charts.

## 4. Implementation Decisions (Resolved)
- **Source Parsing**: Google's default `<source>` tag will be used directly as it reliably provides a clean publisher string.
- **Cache Scalability**: An in-memory `Map` is fully sufficient for the current single-instance deployment. We will swap this for a Redis implementation later if multi-instance scaling is required.
