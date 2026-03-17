# 🎓 EnglishPro AI

**Nền tảng học tiếng Anh cho người đi làm** — sử dụng hệ thống Multi-Agent AI, xây dựng trên [LangGraph JS](https://langchain-ai.github.io/langgraphjs/) và [OpenAI](https://openai.com/).

---

## 📑 Mục Lục

- [Tổng Quan Kiến Trúc](#-tổng-quan-kiến-trúc)
- [Cài Đặt](#-cài-đặt)
- [Cấu Hình](#-cấu-hình)
- [Chạy Dự Án](#-chạy-dự-án)
- [Giao Tiếp Với Agent](#-giao-tiếp-với-agent)
  - [Qua CLI](#1-qua-cli-command-line)
  - [Qua API](#2-qua-api-rest)
- [API Reference](#-api-reference)
- [Cấu Trúc Dự Án](#-cấu-trúc-dự-án)

---

## 🏗 Tổng Quan Kiến Trúc

Dự án gồm **2 hệ thống agent chính**:

### 1. Dev Team Workflow (Multi-Agent + Human-in-the-Loop)

Mô phỏng quy trình phát triển phần mềm với 4 AI agent, có **cơ chế phê duyệt bởi con người** tại mỗi bước:

```
Feature Request
      ↓
🧑‍💼 PO Agent → Tạo User Stories
      ↓
🔒 Human Approval (Approve / Reject + Feedback)
      ↓
📊 BA Agent → Tạo Design Document
      ↓
🔒 Human Approval
      ↓
💻 DEV Agent → Viết Source Code
      ↓
🔒 Human Approval (Code Review)
      ↓
🧪 Tester Agent → Chạy Test
      ↓
🔒 Human Approval (Release Decision)
      ↓
🎉 Done!
```

> **Nếu bước nào bị Reject**, agent sẽ nhận feedback và quay lại sửa.

### 2. Tutor Chat (English Learning Agent)

Agent dạy tiếng Anh, hỗ trợ chat trực tiếp và streaming (Server-Sent Events).

---

## 📦 Cài Đặt

**Yêu cầu:** Node.js >= 18, npm

```bash
# Clone dự án
git clone <repo-url>
cd celestial-flare

# Cài dependencies cho Backend
npm install

# Cài dependencies cho Frontend
cd frontend
npm install
cd ..
```

---

## ⚙ Cấu Hình

Tạo file `.env` từ template:

```bash
cp .env.example .env
```

Chỉnh sửa file `.env`:

```env
# [BẮT BUỘC] OpenAI API Key
OPENAI_API_KEY=sk-your-openai-api-key-here

# [Tùy chọn] Model (mặc định: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini

# [Tùy chọn] Server config
PORT=3000
NODE_ENV=development
```

---

## 🚀 Chạy Dự Án

### Backend (API Server)

```bash
# Development (hot-reload)
npm run dev

# Production
npm run build
npm start
```

Server sẽ chạy tại `http://localhost:3000`

### Frontend

```bash
cd frontend
npm run dev
```

---

## 🤖 Giao Tiếp Với Agent

Có **2 cách** để tương tác với Dev Team Workflow:

### 1. Qua CLI (Command Line)

Sử dụng file `test-cli.ts` để test workflow trực tiếp trên terminal:

```bash
npm run cli
```

**Luồng hoạt động:**

1. Chương trình hỏi bạn nhập **Feature Request** (yêu cầu tính năng)
2. PO Agent xử lý và tạo User Stories
3. Terminal hiển thị nội dung và hỏi bạn **Approve (1)** hoặc **Reject (2)**
4. Nếu Reject → nhập lý do → Agent sẽ sửa
5. Nếu Approve → chuyển sang agent tiếp theo
6. Lặp lại cho mỗi phase (Design → Code → Test → Release)

**Ví dụ:**

```
📝 Vui lòng nhập Feature Request:
> Tạo tính năng flashcard học từ vựng

⏳ Hệ thống đang khởi tạo workflow...

==============================================
🔒 YÊU CẦU PHÊ DUYỆT: 📋 Duyệt User Stories
==============================================

[NỘI DUNG TỪ AGENT]=
1. Là người dùng, tôi muốn tạo bộ flashcard...
2. Là người dùng, tôi muốn lật thẻ để xem nghĩa...

[CÂU HỎI]= Bạn có đồng ý với User Stories này không?

Bạn chọn: (1) Approve  (2) Reject
> 1
```

---

### 2. Qua API (REST)

Khi server đang chạy (`npm run dev`), bạn có thể dùng `curl`, Postman, hoặc frontend để gọi API.

#### Bước 1: Bắt đầu workflow

```bash
curl -X POST http://localhost:3000/api/dev-team/start \
  -H "Content-Type: application/json" \
  -d '{"featureRequest": "Tạo tính năng flashcard học từ vựng"}'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "threadId": "thread-abc123",
    "currentPhase": "requirements",
    "status": "waiting_approval",
    "pendingApproval": {
      "type": "requirements_review",
      "title": "📋 Duyệt User Stories",
      "content": "1. Là người dùng...",
      "question": "Bạn có đồng ý với User Stories này không?"
    },
    "output": {
      "userStories": "...",
      "designDocument": null,
      "sourceCode": null,
      "testResults": null
    }
  }
}
```

> ⚠️ **Quan trọng**: Lưu lại `threadId` — bạn cần nó cho các bước tiếp theo.

#### Bước 2: Approve hoặc Reject

```bash
# Approve
curl -X POST http://localhost:3000/api/dev-team/approve \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread-abc123",
    "action": "approve",
    "feedback": "Looks good!"
  }'

# Reject (gửi kèm feedback)
curl -X POST http://localhost:3000/api/dev-team/approve \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread-abc123",
    "action": "reject",
    "feedback": "Cần thêm user story cho phần ôn tập"
  }'
```

Sau khi approve, response sẽ chứa **pendingApproval mới** (phase tiếp theo) hoặc `status: "completed"` nếu đã xong.

> 💡 **Lặp lại Bước 2** cho mỗi phase: Requirements → Design → Code Review → Release.

#### Bước 3: Kiểm tra trạng thái (tùy chọn)

```bash
curl http://localhost:3000/api/dev-team/status/thread-abc123
```

---

## 📚 API Reference

### Dev Team Workflow

| Method | Endpoint                         | Mô tả                           | Body                                                     |
| ------ | -------------------------------- | -------------------------------- | -------------------------------------------------------- |
| POST   | `/api/dev-team/start`            | Bắt đầu workflow mới            | `{ "featureRequest": "string" }`                         |
| POST   | `/api/dev-team/approve`          | Approve/Reject tại approval gate | `{ "threadId": "string", "action": "approve\|reject", "feedback?": "string" }` |
| GET    | `/api/dev-team/status/:threadId` | Xem trạng thái workflow          | —                                                        |

### Tutor Chat

| Method | Endpoint            | Mô tả                          | Body                                                               |
| ------ | ------------------- | ------------------------------- | ------------------------------------------------------------------ |
| POST   | `/api/chat`         | Gửi tin nhắn cho AI Tutor      | `{ "message": "string", "threadId?": "string" }`                   |
| POST   | `/api/chat/stream`  | Stream phản hồi (SSE)          | `{ "message": "string", "threadId?": "string" }`                   |

### Health Check

| Method | Endpoint       | Mô tả               |
| ------ | -------------- | -------------------- |
| GET    | `/api/health`  | Kiểm tra server hoạt động |

---

## 📂 Cấu Trúc Dự Án

```
celestial-flare/
├── src/
│   ├── index.ts              # Express server chính
│   ├── test-cli.ts           # CLI tester cho Dev Team workflow
│   ├── api/
│   │   ├── chat.routes.ts    # Routes cho Tutor Chat
│   │   ├── dev-team.routes.ts # Routes cho Dev Team workflow
│   │   └── middleware.ts     # Middleware (logger, error handler, validation)
│   ├── config/
│   │   └── env.ts            # Đọc và validate biến môi trường
│   ├── dev-team/
│   │   ├── graph.ts          # LangGraph workflow (PO → BA → DEV → Tester)
│   │   ├── state.ts          # State definition cho workflow
│   │   └── agents/           # Các AI agent (po, ba, dev, tester)
│   ├── tutor/
│   │   └── graph.ts          # LangGraph cho Tutor Chat
│   └── utils/
│       ├── logger.ts         # Tiện ích ghi log
│       └── helpers.ts        # Hàm hỗ trợ (generateThreadId, ...)
├── frontend/                 # Frontend (Vite + React)
├── .env.example              # Template biến môi trường
├── package.json
└── tsconfig.json
```

---

## 🛠 Scripts

| Lệnh              | Mô tả                                       |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Chạy backend server với hot-reload (tsx watch) |
| `npm run cli`      | Chạy CLI tester cho Dev Team workflow        |
| `npm run build`    | Build TypeScript → JavaScript               |
| `npm start`        | Chạy production build                        |
| `npm test`         | Chạy unit tests (vitest)                     |
| `npm run test:watch` | Chạy tests ở chế độ watch                 |

---

## 📜 License

MIT
