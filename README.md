# FinTrack

**FinTrack** is a high-efficiency, mobile-first Progressive Web App (PWA) built for fast, localized financial transaction tracking. Sign in with your Google account, log income and expenses on the go, and keep your team instantly in sync via Telegram — all from a clean, installable app on your phone.

![Version](https://img.shields.io/badge/version-1.1.0-2EE8B4)
![Platform](https://img.shields.io/badge/platform-PWA-4285F4)
![Auth](https://img.shields.io/badge/sign--in-Google-EA4335)
![Notifications](https://img.shields.io/badge/notifications-Telegram-26A5E4)
![Languages](https://img.shields.io/badge/languages-5%20supported-success)

---

Pick your preferred language below — both sections cover the same guide.

- [🇺🇸 English User Guide](#-english-user-guide)
- [🇹🇭 คู่มือการใช้งานภาษาไทย](#-คู่มือการใช้งานภาษาไทย)

---

## 🇺🇸 English User Guide

### ✨ Core Features

- **🔐 Native Google Sign-In** — Quick, secure identity verification using your existing Google account. Completely passwordless — no usernames, PINs, or accounts to remember.
- **📲 Instant Telegram Alerts** — Every transaction you save sends a real-time summary notification straight to your management's Telegram channel.
- **⚙️ Standalone Settings Page** — A dedicated, full-screen settings view for your preferences, separated from the main entry screen.
- **🌗 Visual Customization** — Switch instantly between Light and Dark mode. Your choice is remembered automatically for next time.
- **🌐 5-Language Support** — Fully localized in English, Thai (ไทย), Lao (ລາວ), Vietnamese (Tiếng Việt), and Burmese (မြန်မာ).
- **📱 Installable App** — Add FinTrack to your home screen for a native app experience, with offline support built in.

---

### 📖 How to Use FinTrack

1. **Sign in** — Open the FinTrack link and tap **"Sign in with Google"** to verify your identity with your Google account.
2. **Log a transaction** — Fill in the details: amount, item name, branch/location, your name, and currency.
3. **Save it** — Tap **"Save Entry"** to record the transaction. A summary notification is sent automatically to the management Telegram channel.
4. **Customize your experience** — Open the **Settings** tab anytime to switch between Light/Dark mode or change your display language.

---

### 🧱 Architecture Overview

| Layer | Technology |
| --- | --- |
| Frontend | HTML5, CSS Variables, Progressive Web App (PWA) |
| Backend | Google Apps Script — Workspace Cloud Core |
| Database | Google Sheets |
| Notifications | Telegram Bot API |

---

## 🇹🇭 คู่มือการใช้งานภาษาไทย

### ✨ ฟีเจอร์เด่น

- **🔐 เข้าสู่ระบบด้วย Google** — ยืนยันตัวตนได้อย่างรวดเร็วและปลอดภัยด้วยบัญชี Google ของคุณ ไม่ต้องใช้รหัสผ่านหรือจดจำบัญชีแยกใดๆ
- **📲 แจ้งเตือนผ่าน Telegram ทันที** — ทุกครั้งที่บันทึกรายการ ระบบจะส่งสรุปข้อมูลแบบเรียลไทม์ไปยังช่อง Telegram ของฝ่ายบริหารโดยอัตโนมัติ
- **⚙️ หน้าตั้งค่าแยกเฉพาะ** — หน้าตั้งค่าแบบเต็มหน้าจอ แยกออกจากหน้าบันทึกรายการหลักอย่างชัดเจน
- **🌗 ปรับแต่งการแสดงผล** — สลับโหมดสว่าง/มืดได้ทันที และระบบจะจดจำการตั้งค่าไว้ใช้ในครั้งถัดไป
- **🌐 รองรับ 5 ภาษา** — รองรับภาษาอังกฤษ, ไทย, ลาว (ລາວ), เวียดนาม (Tiếng Việt) และพม่า (မြန်မာ) แบบครบถ้วน
- **📱 ติดตั้งเป็นแอปได้** — เพิ่ม FinTrack ลงหน้าโฮมสกรีนเพื่อใช้งานเหมือนแอปจริง พร้อมรองรับการใช้งานออฟไลน์

---

### 📖 วิธีใช้งาน FinTrack

1. **เข้าสู่ระบบ** — เปิดลิงก์ FinTrack แล้วแตะ **"Sign in with Google"** เพื่อยืนยันตัวตนด้วยบัญชี Google ของคุณ
2. **บันทึกรายการ** — กรอกรายละเอียด: จำนวนเงิน, ชื่อรายการ, สาขา/สถานที่, ชื่อผู้บันทึก และสกุลเงิน
3. **บันทึกข้อมูล** — แตะ **"Save Entry"** เพื่อบันทึกรายการ ระบบจะส่งสรุปข้อมูลไปยังช่อง Telegram ของฝ่ายบริหารโดยอัตโนมัติ
4. **ปรับแต่งการใช้งาน** — เข้าหน้า **Settings** ได้ทุกเมื่อ เพื่อสลับโหมดสว่าง/มืด หรือเปลี่ยนภาษาที่แสดง

---

### 🧱 ภาพรวมโครงสร้างระบบ

| ส่วนประกอบ | เทคโนโลยี |
| --- | --- |
| Frontend | HTML5, CSS Variables, Progressive Web App (PWA) |
| Backend | Google Apps Script — Workspace Cloud Core |
| ฐานข้อมูล | Google Sheets |
| การแจ้งเตือน | Telegram Bot API |
