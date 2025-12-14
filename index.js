import express from "express";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = process.env.PORT || 3000;

/* =======================
   Helper: base64
======================= */
const b64 = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64");

/* =======================
   API
======================= */
app.get("/zee5/hdntl", async (req, res) => {
  try {
    const UA =
      req.headers["user-agent"] ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

    /* =======================
       Guest Token
    ======================= */
    const guestToken = uuidv4();

    /* =======================
       DD Token
    ======================= */
    const ddToken = b64({
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
        hdcp_version: [
          "HDCP_V1",
          "HDCP_V2",
          "HDCP_V2_1",
          "HDCP_V2_2"
        ]
      }
    });

    /* =======================
       Platform Token (NEW)
    ======================= */
    const tokenRes = await fetch(
      "https://gwapi.zee5.com/content/launch",
      {
        headers: {
          "User-Agent": UA,
          "Accept": "application/json",
          "Origin": "https://www.zee5.com",
          "Referer": "https://www.zee5.com/"
        }
      }
    );

    const tokenData = await tokenRes.json();

    const platformToken =
      tokenData?.platform_token ||
      tokenData?.platformToken ||
      tokenData?.data?.platform_token;

    if (!platformToken) {
      return res.status(500).json({
        success: false,
        message: "Platform token not found"
      });
    }

    /* =======================
       Secure Playback API
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
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": UA,
        "Origin": "https://www.zee5.com",
        "Referer": "https://www.zee5.com/",
        "Content-Length": payload.length
      },
      body: payload
    });

    const apiData = await apiRes.json();
    const m3u8Url =
      apiData?.keyOsDetails?.video_token;

    if (!m3u8Url) {
      return res.status(404).json({
        success: false,
        message: "M3U8 not found"
      });
    }

    /* =======================
       Extract hdntl
    ======================= */
    const m3u8Res = await fetch(m3u8Url, {
      headers: { "User-Agent": UA }
    });

    const m3u8Text = await m3u8Res.text();
    const hdntlMatch = m3u8Text.match(/hdntl=[^\s"]+/);

    if (!hdntlMatch) {
      return res.status(404).json({
        success: false,
        message: "hdntl not found"
      });
    }

    /* =======================
       Response
    ======================= */
    res.json({
      success: true,
      platform_token: platformToken,
      guest_token: guestToken,
      m3u8: m3u8Url,
      hdntl: hdntlMatch[0]
    });

  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

app.listen(PORT, () => {
  console.log("ZEE5 API running on port", PORT);
});
