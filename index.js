
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cheerio = require("cheerio");
const cron = require("node-cron");
const fs = require("fs");

// ===== CONFIG =====
const BOT_TOKEN = process.env.BOT_TOKEN;           // ใส่ใน .env
const CHAT_ID = process.env.CHAT_ID;               // ใส่ใน .env
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // ใส่ใน .env
const CHECK_INTERVAL = "*/15 * * * *";             // ทุก 15 นาที
const SEEN_FILE = "./seen_articles.json";

const SOURCES = [
  {
    name: "TikTok Business Blog",
    url: "https://www.tiktok.com/business/en-US/blog",
    type: "tiktok-blog",
  },
  {
    name: "TikTok For Business Newsroom",
    url: "https://newsroom.tiktok.com/en-us",
    type: "newsroom",
  },
];

// ===== BOT SETUP =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== SEEN ARTICLES (ป้องกันแจ้งซ้ำ) =====
function loadSeen() {
  if (!fs.existsSync(SEEN_FILE)) return new Set();
  const data = JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
  return new Set(data);
}

function saveSeen(seen) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen]), "utf-8");
}

// ===== SCRAPER: ดึงรายชื่อบทความ =====
async function fetchArticleList(source) {
  try {
    const { data } = await axios.get(source.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const articles = [];

    if (source.type === "tiktok-blog") {
      $("a").each((_, el) => {
        const href = $(el).attr("href") || "";
        const title = $(el).text().trim();
        if (
          href.includes("/blog/") &&
          title.length > 20 &&
          !articles.find((a) => a.url === href)
        ) {
          articles.push({
            title,
            url: href.startsWith("http") ? href : `https://www.tiktok.com${href}`,
            source: source.name,
          });
        }
      });
    } else if (source.type === "newsroom") {
      $("article, .article-card, .post-card").each((_, el) => {
        const title =
          $(el).find("h2, h3, .title").first().text().trim() ||
          $(el).find("a").first().text().trim();
        const href = $(el).find("a").first().attr("href") || "";
        if (title.length > 10 && href) {
          articles.push({
            title,
            url: href.startsWith("http") ? href : `https://newsroom.tiktok.com${href}`,
            source: source.name,
          });
        }
      });
    }

    return articles.slice(0, 10);
  } catch (err) {
    console.error(`❌ Error fetching ${source.name}:`, err.message);
    return [];
  }
}

// ===== SCRAPER: ดึงเนื้อหาบทความ =====
async function fetchArticleContent(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(data);

    // ลบ script, style, nav, footer ออก
    $("script, style, nav, footer, header, .cookie-banner, .popup").remove();

    // ดึงเนื้อหาหลัก
    const content =
      $("article").text() ||
      $("main").text() ||
      $(".blog-content, .post-content, .article-content").text() ||
      $("body").text();

    // ทำความสะอาดข้อความ
    return content.replace(/\s+/g, " ").trim().slice(0, 4000);
  } catch (err) {
    console.error(`❌ Error fetching article content:`, err.message);
    return null;
  }
}

// ===== AI SUMMARY ด้วย Claude =====
async function summarizeWithClaude(title, content, url) {
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `คุณคือผู้เชี่ยวชาญด้าน TikTok Ads และการตลาดดิจิทัล

บทความนี้มาจาก TikTok Business:
ชื่อ: ${title}
เนื้อหา: ${content}

กรุณาสรุปเป็นภาษาไทย ในรูปแบบนี้:

📋 สรุปการอัพเดท:
(สรุปสั้นๆ 2-3 ประโยค ว่ามีการเปลี่ยนแปลงอะไร)

🎯 ผลกระทบต่อผู้ลงโฆษณา:
(บอกว่ากระทบกับแคมเปญหรือการทำโฆษณาอย่างไร)

✅ วิธีรับมือ/แก้ปัญหา:
(แนะนำ 2-3 ข้อ ว่าควรปรับกลยุทธ์หรือตั้งค่าโฆษณาอย่างไร)

⚠️ สิ่งที่ต้องระวัง:
(เตือนถึงสิ่งที่อาจพลาดหรือทำให้โฆษณาได้รับผลกระทบ)`,
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
    console.error("❌ Claude API error:", err.message);
    return null;
  }
}

// ===== ส่งข้อความยาวโดยแบ่ง chunk =====
async function sendLongMessage(chatId, text, options = {}) {
  const MAX_LENGTH = 4000;
  if (text.length <= MAX_LENGTH) {
    await bot.sendMessage(chatId, text, options);
    return;
  }
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    parts.push(remaining.slice(0, MAX_LENGTH));
    remaining = remaining.slice(MAX_LENGTH);
  }
  for (const part of parts) {
    await bot.sendMessage(chatId, part, options);
    await sleep(500);
  }
}

// ===== CHECK & NOTIFY =====
async function checkAndNotify(targetChatId = CHAT_ID) {
  console.log("🔍 กำลังตรวจสอบอัพเดทจาก TikTok Business...");
  const seen = loadSeen();
  let newCount = 0;

  for (const source of SOURCES) {
    const articles = await fetchArticleList(source);

    for (const article of articles) {
      const key = article.url;
      if (!seen.has(key)) {
        seen.add(key);
        newCount++;

        // แจ้งว่ากำลังประมวลผล
        await bot.sendMessage(
          targetChatId,
          `⏳ กำลังวิเคราะห์บทความใหม่จาก ${article.source}...`
        );

        // ดึงเนื้อหาบทความ
        const content = await fetchArticleContent(article.url);

        let summarySection = "";
        if (content && ANTHROPIC_API_KEY) {
          const summary = await summarizeWithClaude(article.title, content, article.url);
          if (summary) {
            summarySection = `\n\n${summary}`;
          }
        }

        const msg =
          `🚨 *อัพเดทใหม่จาก TikTok Ads!*\n\n` +
          `📌 *${escapeMarkdown(article.title)}*\n` +
          `🏷️ แหล่งที่มา: ${escapeMarkdown(article.source)}\n` +
          `🔗 [อ่านบทความเต็ม](${article.url})` +
          `${summarySection ? escapeMarkdown(summarySection) : "\n\n_(ไม่สามารถดึงเนื้อหาได้ กรุณาอ่านจากลิงก์)_"}`;

        await sendLongMessage(targetChatId, msg, {
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        });

        await sleep(2000);
      }
    }
  }

  saveSeen(seen);

  if (newCount === 0) {
    console.log("✅ ไม่มีอัพเดทใหม่ในขณะนี้");
    return false;
  } else {
    console.log(`✅ แจ้งเตือน ${newCount} บทความใหม่`);
    return true;
  }
}

// ===== HELPER =====
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// ===== COMMANDS =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `👋 สวัสดีครับ! ผมคือ *TikTok Ads Update Bot* 🤖\n\n` +
      `ผมจะคอยติดตามข่าวสารจาก TikTok Business แล้วสรุป\n` +
      `พร้อมแนะนำวิธีรับมือให้อัตโนมัติครับ\n\n` +
      `📋 *คำสั่งที่ใช้ได้:*\n` +
      `/check \\- ตรวจสอบอัพเดทตอนนี้เลย\n` +
      `/status \\- ดูสถานะบอท\n` +
      `/help \\- แสดงคำสั่งทั้งหมด\n\n` +
      `⏰ บอทจะแจ้งเตือนอัตโนมัติทุกวัน เวลา 09:00 น\\.`,
    { parse_mode: "MarkdownV2" }
  );
});

bot.onText(/\/check/, async (msg) => {
  await bot.sendMessage(msg.chat.id, "🔍 กำลังตรวจสอบอัพเดทใหม่จาก TikTok Business...");
  const hasNew = await checkAndNotify(msg.chat.id);
  if (!hasNew) {
    await bot.sendMessage(msg.chat.id, "✅ ยังไม่มีอัพเดทใหม่ในขณะนี้ครับ");
  }
});

bot.onText(/\/status/, (msg) => {
  const seen = loadSeen();
  const hasKey = !!ANTHROPIC_API_KEY;
  bot.sendMessage(
    msg.chat.id,
    `🤖 *สถานะบอท*\n\n` +
      `✅ ออนไลน์อยู่\n` +
      `🧠 AI สรุปบทความ: ${hasKey ? "✅ เปิดใช้งาน" : "❌ ยังไม่ได้ตั้งค่า ANTHROPIC\\_API\\_KEY"}\n` +
      `📰 บทความที่ติดตามแล้ว: ${seen.size} รายการ\n` +
      `⏰ ตรวจสอบอัตโนมัติ: ทุกวัน 09:00 น\\.`,
    { parse_mode: "MarkdownV2" }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📋 *คำสั่งทั้งหมด:*\n\n` +
      `/start \\- เริ่มต้นใช้งาน\n` +
      `/check \\- ตรวจสอบอัพเดททันที\n` +
      `/status \\- ดูสถานะบอท\n` +
      `/help \\- แสดงคำสั่งทั้งหมด`,
    { parse_mode: "MarkdownV2" }
  );
});

// ===== CRON JOB (ทุกวัน 09:00 น.) =====
cron.schedule(CHECK_INTERVAL, () => {
  console.log("⏰ Cron job: ตรวจสอบอัพเดทประจำวัน");
  checkAndNotify();
}, {
  timezone: "Asia/Bangkok",
});

// ===== START =====
console.log("🚀 TikTok Ads Update Bot เริ่มทำงานแล้ว!");
console.log(`⏰ จะตรวจสอบอัตโนมัติตาม cron: ${CHECK_INTERVAL} (Asia/Bangkok)`);
if (!ANTHROPIC_API_KEY) {
  console.warn("⚠️  ไม่พบ ANTHROPIC_API_KEY — บอทจะทำงานได้ แต่จะไม่สรุปบทความด้วย AI");
}
checkAndNotify(); // ตรวจสอบทันทีตอน start