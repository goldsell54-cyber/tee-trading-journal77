Tee Trading Journal
===================

วิธีใช้แบบง่ายที่สุด
1) แตกไฟล์ ZIP
2) เปิดโฟลเดอร์ trading-journal
3) ดับเบิลคลิก index.html
4) ใช้งานได้ทันที ข้อมูลจะถูกเก็บในเบราว์เซอร์เครื่องนั้น

ฟีเจอร์
- Dashboard: Net P/L, Win Rate, Profit Factor, Expectancy, Avg/Trade, Max Drawdown
- Equity Curve และ P/L รายวัน
- บันทึก BUY/SELL, Entry, Exit, SL, TP, Lot, P/L, Fee
- Setup, Session, Emotion, Follow Plan, Mistakes, Reason, Note
- รูปก่อนเข้า / หลังออก (รูปจะถูกย่อก่อนเก็บ)
- ค้นหาและกรองรายการ
- วิเคราะห์ตาม Setup / Symbol / Mistake / Session
- Export JSON / CSV และ Import JSON
- Dark / Light mode
- รองรับมือถือ

หมายเหตุสำคัญ
- ข้อมูลเก็บแบบ Local Storage ใน Browser จึงควร Export JSON สำรองเป็นระยะ
- ถ้าล้างข้อมูล Browser หรือเปลี่ยน Browser ข้อมูลอาจไม่ตามไปด้วย
- โหมด PWA/ติดตั้งเป็นแอป ต้องเปิดผ่าน localhost หรือเว็บเซิร์ฟเวอร์ HTTPS ก่อน แต่การใช้งานทั่วไปเปิด index.html ได้เลย

วิธีเปิดผ่าน localhost (ทางเลือก)
- ถ้ามี Python: เปิด Command Prompt ในโฟลเดอร์ แล้วรัน
  python -m http.server 8080
- จากนั้นเข้า http://localhost:8080
