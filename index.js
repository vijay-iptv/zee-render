import express from "express";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = process.env.PORT || 3000;

/* =======================
   Helper: Base64 Encode
======================= */
const base64 = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64");

/* =======================
   API Route
======================= */
app.get("/zee5/hdntl", async (req, res) => {
  try {
    const userAgent =
      req.headers["user-agent"] ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

    /* =======================
       Generate Guest Token
    ======================= */
    const guestToken = uuidv4();

    /* =======================
       Generate DD Token
    ======================= */
    const ddToken = base64({
      schema_version: "1",
      os_name: "N/A",
      os_version: "N/A",
      platform_name: "Chrome",
      platform_version: "104",
      device_name: "",
      app_name: "Web",
      app_version: "2.52.31",
      player_capabilities: {
        audio_channel: ["STEREO"],
        video_codec: ["H264"],
        container: ["MP4", "TS"],
        package: ["DASH", "HLS"],
        resolution: ["240p", "SD", "HD", "FHD"],
        dynamic_range: ["SDR"]
      },
      security_capabilities: {
        encryption: ["WIDEVINE_AES_CTR"],
        widevine_security_level: ["L3"],
        hdcp_version: ["HDCP_V1", "HDCP_V2", "HDCP_V2_1", "HDCP_V2_2"]
      }
    });

    /* =======================
       Fetch Platform Token
    ======================= */
    const pageRes = await fetch(
      "https://www.zee5.com/live-tv/aaj-tak/0-9-aajtak",
      {
        headers: { "User-Agent": userAgent }
      }
    );

    const html = await pageRes.text();
    const match = html.match(
      /"gwapiPlatformToken"\s*:\s*"([^"]+)"/
    );

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Platform token not found"
      });
    }

    const platformToken = match[1];

    /* =======================
       Fetch Playback Details
    ======================= */
    const payload = JSON.stringify({
      "x-access-token": platformToken,
      "X-Z5-Guest-Token": guestToken,
      "x-dd-token": ddToken
    });

    const apiUrl =
      "https://spapi.zee5.com/singlePlayback/getDetails/secure" +
      "?channel_id=0-9-9z583538" +
      "&device_id=" + guestToken +
      "&platform_name=desktop_web" +
      "&translation=en" +
      "&user_language=en,hi,te" +
      "&country=IN" +
      "&state=" +
      "&app_version=4.24.0" +
      "&user_type=guest" +
      "&check_parental_control=false";

    const apiRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: "https://www.zee5.com",
        Referer: "https://www.zee5.com/",
        "User-Agent": userAgent,
        "Content-Length": payload.length
      },
      body: payload
    });

    const apiData = await apiRes.json();

    const m3u8Url =
      apiData?.keyOsDetails?.video_token;

    if (!m3u8Url || !m3u8Url.startsWith("http")) {
      return res.status(404).json({
        success: false,
        message: "M3U8 URL not found"
      });
    }

    /* =======================
       Load M3U8 & Extract hdntl
    ======================= */
    const m3u8Res = await fetch(m3u8Url, {
      headers: { "User-Agent": userAgent }
    });

    const m3u8Text = await m3u8Res.text();
    const hdntlMatch = m3u8Text.match(/hdntl=[^\s"]+/);

    if (!hdntlMatch) {
      return res.status(404).json({
        success: false,
        message: "hdntl token not found"
      });
    }

    /* =======================
       Final Response
    ======================= */
    res.json({
      success: true,
      hdntl: hdntlMatch[0],
      m3u8: m3u8Url
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log("ZEE5 API running on port", PORT);
});
