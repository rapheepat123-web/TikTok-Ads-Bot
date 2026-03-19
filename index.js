require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");

// ===== CONFIG =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

// ===== BOT SETUP =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function sendLongMessage(chatId, text, options = {}) {
  const MAX_LENGTH = 4000;
  if (text.length <= MAX_LENGTH) {
    await bot.sendMessage(chatId, text, options);
    return;
  }
  let remaining = text;
  while (remaining.length > 0) {
    await bot.sendMessage(chatId, remaining.slice(0, MAX_LENGTH), options);
    remaining = remaining.slice(MAX_LENGTH);
    await sleep(500);
  }
}

// ===== AI: ถาม-ตอบครบทุกเรื่อง =====
async function askClaude(question) {
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `คุณคือ AI ผู้เชี่ยวชาญครบจบ มีความรู้ลึกในเรื่องต่อไปนี้:

🎯 TikTok Ads:
- การตั้งค่าและบริหารแคมเปญทุกประเภท
- นโยบายโฆษณาและสาเหตุโฆษณาโดนระงับ
- ขั้นตอนยื่นอุทธรณ์โฆษณาอย่างละเอียด
- เพิ่มประสิทธิภาพ CTR, CPM, ROAS
- Spark Ads, TopView, In-Feed Ads

🎥 การสร้างวิดีโอ AI:
- สร้างวิดีโอโฆษณาด้วย HeyGen
- Clone เสียงตัวเองและทำ Lip Sync
- สร้าง Avatar หน้าเหมือนตัวเอง
- เจนวิดีโอโปรโมทสินค้าและเกม
- เทคนิคทำวิดีโอให้ดูสมจริง

🎨 การเจนรูป AI:
- Prompt เทคนิคทำรูปให้สมจริง
- เจนรูปสินค้าและโฆษณา
- เจนรูปโปรโมทเกม
- สไตล์ต่างๆ สำหรับ Social Media

🎮 วิดีโอเกม:
- แนะนำเกมทุกประเภท
- เทคนิคและกลยุทธ์การเล่น
- โฆษณาเกมบน TikTok
- สร้างคอนเทนต์เกม

กฎการตอบ:
1. ตอบเป็นภาษาไทยเสมอ
2. ตอบละเอียดเป็นขั้นตอนชัดเจน
3. ถ้าไม่เข้าใจคำถามให้ถามกลับทันที
4. แนะนำขั้นตอนต่อไปให้เสมอ
5. ถ้าถามเรื่องวิธีทำอะไร ให้สอนทีละขั้นตอนเลย

คำถาม: ${question}`,
          },
        ],
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );
    return response.data.content[0].text;
  } catch (err) {
    console.error("❌ Claude error:", err.message);
    return null;
  }
}

// ===== AI: เขียน Script วิดีโอ =====
async function generateScript(prompt) {
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `คุณคือผู้เชี่ยวชาญด้านการเขียน Script วิดีโอสำหรับ TikTok และ Social Media

สร้าง Script วิดีโอจากข้อมูลนี้: ${prompt}

รูปแบบ:
🎬 *Script วิดีโอ*

⏱️ Hook (0-3 วินาที):
[ประโยคเปิดดึงดูดทันที]

📢 เนื้อหาหลัก (3-25 วินาที):
[นำเสนอสินค้า/เกม/บริการ จุดเด่น ประโยชน์]

🎯 CTA (25-30 วินาที):
[กระตุ้นให้ดำเนินการ]

💡 เทคนิคการถ่ายทำ:
[แนะนำมุมกล้อง เอฟเฟกต์ เพลง]`,
          },
        ],
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );
    return response.data.content[0].text;
  } catch (err) {
    console.error("❌ Script error:", err.message);
    return null;
  }
}

// ===== AI: เจนรูปด้วย DALL-E =====
async function generateImage(prompt) {
  try {
    const enhancedPrompt = await askClaude(
      `แปลง Prompt นี้เป็นภาษาอังกฤษสำหรับ DALL-E ให้รูปดูสมจริงมาก เหมาะกับโฆษณา Social Media: "${prompt}". ตอบแค่ Prompt ภาษาอังกฤษเท่านั้น ไม่ต้องอธิบาย`
    );

    const response = await axios.post(
      "https://api.openai.com/v1/images/generations",
      {
        model: "dall-e-3",
        prompt: enhancedPrompt || prompt,
        n: 1,
        size: "1024x1024",
        quality: "hd",
        style: "natural",
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );
    return response.data.data[0].url;
  } catch (err) {
    console.error("❌ DALL-E error:", err.message);
    return null;
  }
}

// ===== AI: เจนวิดีโอด้วย HeyGen =====
async function generateVideo(script, avatarId = null) {
  try {
    if (!avatarId) {
      const avatarsRes = await axios.get("https://api.heygen.com/v2/avatars", {
        headers: { "x-api-key": HEYGEN_API_KEY },
      });
      const avatars = avatarsRes.data.data.avatars;
      avatarId = avatars[0]?.avatar_id;
    }

    const response = await axios.post(
      "https://api.heygen.com/v2/video/generate",
      {
        video_inputs: [
          {
            character: {
              type: "avatar",
              avatar_id: avatarId,
              avatar_style: "normal",
            },
            voice: {
              type: "text",
              input_text: script,
              voice_id: "th-TH-NiwatNeural",
            },
          },
        ],
        dimension: { width: 1080, height: 1920 },
        aspect_ratio: "9:16",
      },
      {
        headers: {
          "x-api-key": HEYGEN_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );
    return response.data.data.video_id;
  } catch (err) {
    console.error("❌ HeyGen error:", err.message);
    return null;
  }
}

async function waitForVideo(videoId) {
  for (let i = 0; i < 30; i++) {
    await sleep(10000);
    try {
      const response = await axios.get(
        `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
        { headers: { "x-api-key": HEYGEN_API_KEY } }
      );
      const status = response.data.data;
      if (status.status === "completed") return status.video_url;
      if (status.status === "failed") return null;
    } catch (err) {
      console.error("❌ Video status error:", err.message);
    }
  }
  return null;
}

// ===== AI: วิเคราะห์รูปภาพ =====
async function analyzeImage(imageBase64, caption) {
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
              },
              {
                type: "text",
                text: `คุณคือ AI ผู้เชี่ยวชาญครบจบ วิเคราะห์รูปนี้เป็นภาษาไทยละเอียดทุกขั้นตอน
${caption ? `คำถามเพิ่มเติม: ${caption}` : ""}

ถ้าเป็น Error/แจ้งเตือน TikTok Ads:
1. บอกว่าเกิดอะไรขึ้น
2. สาเหตุที่เป็นไปได้
3. วิธีแก้ไขทีละขั้นตอน
4. วิธียื่นอุทธรณ์ (ถ้าจำเป็น)

ถ้าเป็นสถิติ/ผลแคมเปญ:
1. สรุปผลที่เห็น
2. จุดที่ดีและควรปรับปรุง
3. คำแนะนำเพิ่มประสิทธิภาพ

ถ้าเป็นเรื่องอื่น:
วิเคราะห์และให้คำแนะนำที่เป็นประโยชน์`,
              },
            ],
          },
        ],
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );
    return response.data.content[0].text;
  } catch (err) {
    console.error("❌ Image analysis error:", err.message);
    return null;
  }
}

// ===== COMMANDS =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `👋 สวัสดีครับ! ผมคือ *AI Expert Bot* 🤖\n\n` +
    `💬 *ถามผมได้ทุกเรื่องเลยครับ!*\n\n` +
    `📋 *คำสั่ง:*\n` +
    `/script - เขียน Script วิดีโอ\n` +
    `/image - เจนรูปสมจริง\n` +
    `/video - เจนวิดีโอ AI\n` +
    `/appeal - วิธียื่นอุทธรณ์โฆษณา\n` +
    `/clone - วิธี Clone เสียงตัวเอง\n` +
    `/help - ดูทุกคำสั่ง\n\n` +
    `📸 *ส่งรูปหน้าจอมาวิเคราะห์ได้เลยครับ*\n\n` +
    `🎯 *ตัวอย่างถามได้เลย:*\n` +
    `"ยื่นอุทธรณ์ยังไง"\n` +
    `"สร้างวิดีโอโปรโมทเกมยังไง"\n` +
    `"CPM สูงเกินแก้ยังไง"`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📋 *คำสั่งทั้งหมด:*\n\n` +
    `*/script* [รายละเอียด]\n` +
    `ตัวอย่าง: /script ขายครีมบำรุงผิว ผู้หญิง 25-35 ปี\n\n` +
    `*/image* [รายละเอียด]\n` +
    `ตัวอย่าง: /image ครีมบำรุงผิว พื้นหลังขาว สมจริง\n\n` +
    `*/video* [รายละเอียด]\n` +
    `ตัวอย่าง: /video โปรโมทเกม ROV สไตล์ตื่นเต้น 30 วิ\n\n` +
    `*/appeal* - ขั้นตอนยื่นอุทธรณ์โฆษณา\n\n` +
    `*/clone* - วิธี Clone เสียงตัวเองใน HeyGen\n\n` +
    `📸 *ส่งรูปมาวิเคราะห์ได้เลยครับ*\n\n` +
    `💬 *หรือพิมพ์ถามได้เลยทุกเรื่อง*`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/appeal/, async (msg) => {
  await bot.sendMessage(msg.chat.id, "⏳ กำลังเตรียมข้อมูลการยื่นอุทธรณ์...");
  const answer = await askClaude("อธิบายขั้นตอนการยื่นอุทธรณ์โฆษณา TikTok Ads ที่โดนระงับหรือปฏิเสธ อย่างละเอียดทีละขั้นตอน พร้อมเทคนิคที่ช่วยให้อุทธรณ์สำเร็จ และสิ่งที่ควรเขียนในคำอุทธรณ์");
  if (answer) {
    await sendLongMessage(msg.chat.id, `📋 *วิธียื่นอุทธรณ์โฆษณา TikTok*\n\n${answer}`, { parse_mode: "Markdown" });
  } else {
    await bot.sendMessage(msg.chat.id, "❌ ไม่สามารถดึงข้อมูลได้ครับ ลองใหม่อีกครั้ง");
  }
});

bot.onText(/\/clone/, async (msg) => {
  await bot.sendMessage(msg.chat.id, "⏳ กำลังเตรียมข้อมูล Clone เสียง...");
  const answer = await askClaude("อธิบายขั้นตอนการ Clone เสียงตัวเองใน HeyGen อย่างละเอียดทีละขั้นตอน พร้อมเทคนิคทำให้เสียงสมจริงที่สุด และวิธีนำไปใช้สร้างวิดีโอ");
  if (answer) {
    await sendLongMessage(msg.chat.id, `🎙️ *วิธี Clone เสียงตัวเองใน HeyGen*\n\n${answer}`, { parse_mode: "Markdown" });
  } else {
    await bot.sendMessage(msg.chat.id, "❌ ไม่สามารถดึงข้อมูลได้ครับ ลองใหม่อีกครั้ง");
  }
});

bot.onText(/\/script (.+)/, async (msg, match) => {
  const prompt = match[1];
  await bot.sendMessage(msg.chat.id, "✍️ กำลังเขียน Script ให้...");
  const script = await generateScript(prompt);
  if (script) {
    await sendLongMessage(msg.chat.id, script, { parse_mode: "Markdown" });
  } else {
    await bot.sendMessage(msg.chat.id, "❌ ไม่สามารถเขียน Script ได้ครับ ลองใหม่อีกครั้ง");
  }
});

bot.onText(/\/script$/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📝 กรุณาใส่รายละเอียดด้วยครับ\n\nตัวอย่าง:\n` +
    `/script ขายครีมบำรุงผิว กลุ่มเป้าหมายผู้หญิง 25-35 ปี\n` +
    `/script โปรโมทเกม ROV สไตล์ตื่นเต้น`
  );
});

bot.onText(/\/image (.+)/, async (msg, match) => {
  const prompt = match[1];
  await bot.sendMessage(msg.chat.id, "🎨 กำลังเจนรูปให้ รอสักครู่...");
  const imageUrl = await generateImage(prompt);
  if (imageUrl) {
    await bot.sendPhoto(msg.chat.id, imageUrl, { caption: `✅ รูปที่เจนจาก: "${prompt}"` });
  } else {
    await bot.sendMessage(msg.chat.id, "❌ ไม่สามารถเจนรูปได้ครับ ลองใหม่อีกครั้ง");
  }
});

bot.onText(/\/image$/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🎨 กรุณาใส่รายละเอียดด้วยครับ\n\nตัวอย่าง:\n` +
    `/image ครีมบำรุงผิว พื้นหลังขาว สมจริง\n` +
    `/image โปรโมทเกม ROV กราฟิกสวยงาม`
  );
});

bot.onText(/\/video (.+)/, async (msg, match) => {
  const prompt = match[1];
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId, "✍️ กำลังเขียน Script...");
  const script = await generateScript(prompt);
  if (!script) {
    await bot.sendMessage(chatId, "❌ ไม่สามารถเขียน Script ได้ครับ");
    return;
  }

  await sendLongMessage(chatId, `📝 *Script ที่จะใช้:*\n\n${script}`, { parse_mode: "Markdown" });
  await bot.sendMessage(chatId, "🎥 กำลังสร้างวิดีโอ รอประมาณ 2-5 นาทีครับ...");

  const videoId = await generateVideo(
    script.replace(/[*_#\[\]()]/g, "").slice(0, 500)
  );

  if (!videoId) {
    await bot.sendMessage(chatId, "❌ ไม่สามารถสร้างวิดีโอได้ครับ ลองใหม่อีกครั้ง");
    return;
  }

  await bot.sendMessage(chatId, "⏳ กำลังประมวลผลวิดีโอ...");
  const videoUrl = await waitForVideo(videoId);

  if (videoUrl) {
    await bot.sendVideo(chatId, videoUrl, { caption: `✅ วิดีโอจาก: "${prompt}"` });
  } else {
    await bot.sendMessage(chatId, `❌ วิดีโอใช้เวลานานเกินไปครับ ลองใหม่อีกครั้ง`);
  }
});

bot.onText(/\/video$/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🎥 กรุณาใส่รายละเอียดด้วยครับ\n\nตัวอย่าง:\n` +
    `/video ขายครีมบำรุงผิว กลุ่มเป้าหมายผู้หญิง 25-35 ปี\n` +
    `/video โปรโมทเกม ROV สไตล์ตื่นเต้น 30 วินาที`
  );
});

bot.onText(/\/status/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🤖 *สถานะบอท*\n\n` +
    `✅ ออนไลน์อยู่\n` +
    `🧠 Claude AI: ${ANTHROPIC_API_KEY ? "✅" : "❌"}\n` +
    `🎨 DALL-E: ${OPENAI_API_KEY ? "✅" : "❌"}\n` +
    `🎥 HeyGen: ${HEYGEN_API_KEY ? "✅" : "❌"}`,
    { parse_mode: "Markdown" }
  );
});

// ===== รับข้อความทั่วไป =====
bot.on("message", async (msg) => {
  const text = msg.text || "";
  const chatId = msg.chat.id;
  if (text.startsWith("/")) return;
  if (text.length < 2) return;

  console.log(`💬 คำถาม: ${text}`);
  const typing = await bot.sendMessage(chatId, "🤔 กำลังวิเคราะห์...");

  const answer = await askClaude(text);

  try { await bot.deleteMessage(chatId, typing.message_id); } catch (e) {}

  if (answer) {
    await sendLongMessage(chatId, `🤖 *AI Expert:*\n\n${answer}`, { parse_mode: "Markdown" });
  } else {
    await bot.sendMessage(chatId, "❌ ขออภัยครับ เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะครับ");
  }
});

// ===== รับรูปภาพ =====
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const caption = msg.caption || "";
  await bot.sendMessage(chatId, "📸 ได้รับรูปแล้ว กำลังวิเคราะห์...");
  try {
    const photo = msg.photo[msg.photo.length - 1];
    const fileInfo = await bot.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
    const imageResponse = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const imageBase64 = Buffer.from(imageResponse.data).toString("base64");
    const analysis = await analyzeImage(imageBase64, caption);
    if (analysis) {
      await sendLongMessage(chatId, `🔍 *ผลการวิเคราะห์:*\n\n${analysis}`, { parse_mode: "Markdown" });
    } else {
      await bot.sendMessage(chatId, "❌ ไม่สามารถวิเคราะห์รูปได้ครับ ลองใหม่อีกครั้ง");
    }
  } catch (err) {
    console.error("❌ Photo error:", err.message);
    await bot.sendMessage(chatId, "❌ เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะครับ");
  }
});

// ===== START =====
console.log("🚀 AI Expert Bot เริ่มทำงานแล้ว!");
console.log(`🧠 Claude: ${ANTHROPIC_API_KEY ? "✅" : "❌"}`);
console.log(`🎨 DALL-E: ${OPENAI_API_KEY ? "✅" : "❌"}`);
console.log(`🎥 HeyGen: ${HEYGEN_API_KEY ? "✅" : "❌"}`);
