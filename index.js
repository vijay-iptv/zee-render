import express from "express";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = process.env.PORT || 3000;

/* =======================
   Helper
======================= */
const b64 = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/* =======================
   API
======================= */
app.get("/zee5/hdntl", async (req, res) => {
  try {
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
       Platform Token (ROBUST)
    ======================= */
    const tokenRes = await fetch(
      "https://gwapi.zee5.com/content/launch",
      {
        headers: {
          "User-Agent": UA,
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-IN,en;q=0.9",
          "Origin": "https://www.zee5.com",
          "Referer": "https://www.zee5.com/",
          "Sec-Fetch-Site": "same-site",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty"
        }
      }
    );

    const tokenRaw = await tokenRes.text();

    /* ⛔ HTML returned → blocked */
    if (tokenRaw.trim().startsWith("<")) {
      return res.status(503).json({
        success: false,
        message: "ZEE5 blocked platform token request",
        preview: tokenRaw.slice(0, 120)
      });
    }

    const tokenData = JSON.parse(tokenRaw);

    const platformToken =
      tokenData?.platform_token ||
      tokenData?.platformToken ||
      tokenData?.data?.platform_token;

    if (!platformToken) {
      return res.status(500).json({
        success: false,
        message: "Platform token missing",
        tokenData
      });
    }

    /* =======================
       Secure Playback
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
        "User-Agent": UA,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://www.zee5.com",
        "Referer": "https://www.zee5.com/"
      },
      body: payload
    });

    const apiRaw = await apiRes.text();

    if (apiRaw.trim().startsWith("<")) {
      return res.status(503).json({
        success: false,
        message: "Playback API blocked",
        preview: apiRaw.slice(0, 120)
      });
    }

    const apiData = JSON.parse(apiRaw);
    const m3u8Url = apiData?.keyOsDetails?.video_token;

    if (!m3u8Url) {
      return res.status(404).json({
        success: false,
        message: "M3U8 not found",
        apiData
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
        message: "hdntl token not found"
      });
    }

    /* =======================
       SUCCESS
    ======================= */
    res.json({
      success: true,
      m3u8: m3u8Url,
      hdntl: hdntlMatch[0]
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* =======================
   Start Server
======================= */
app.listen(PORT, () => {
  console.log("ZEE5 Render API running on port", PORT);
});
