# UrbanV — Tra cứu quy hoạch Phường Hạc Thành, Tỉnh Thanh Hóa

UrbanV là ứng dụng web di động (mobile-first web app) phục vụ thí điểm và demo nhà đầu tư, giúp người dân tra cứu trạng thái quy hoạch sử dụng đất tại một vị trí thuộc **Phường Hạc Thành, Tỉnh Thanh Hóa** với đầy đủ căn cứ pháp lý minh bạch.

---

## 1. Phạm vi thí điểm (Pilot Scope) & Nguyên tắc dữ liệu

- **Khu vực thí điểm**: Duy nhất **Phường Hạc Thành, Tỉnh Thanh Hóa** (đơn vị hành chính cấp xã/phường thành lập từ 01/07/2025 theo Đề án sắp xếp ĐVHC của Chính phủ).
- **Tuyệt đối không dùng dữ liệu giả (No Sample Data)**:
  - Ứng dụng tuân thủ nghiêm ngặt nguyên tắc: **Không bịa đặt số liệu, không sinh dữ liệu mẫu placeholder hoặc "lorem ipsum"**.
  - Mọi polygon và văn bản viện dẫn phải có nguồn gốc pháp lý chính xác (trang văn bản, số hiệu, cơ quan ban hành).
  - Trạng thái chưa có dữ liệu sẽ hiển thị trung thực là `Chưa có dữ liệu` (`nodata`), tuyệt đối không đoán mò.
- Land-use codes and legend colour groups are defined only in src/taxonomy.ts (v2).
- **Bốn trạng thái kết quả (Result States)**:
  1. `fit` (Phù hợp quy hoạch): Vị trí nằm trong vùng quy hoạch đã duyệt, dữ liệu mới và cách xa ranh giới.
  2. `caution` (Cần lưu ý): Có quy hoạch chuyển tiếp hoặc chồng lấn hành lang giao thông.
  3. `uncertain` (Không chắc chắn, cần xác minh): Vị trí nằm sát ranh giới (< ngưỡng sai số hoặc 30m), hoặc dữ liệu cũ (> 12 tháng), hoặc đang ở chế độ xem trước bản nháp.
  4. `nodata` (Chưa có dữ liệu): Nằm ngoài phạm vi thí điểm hoặc chưa có dữ liệu quy hoạch đã duyệt tại vị trí đó.

---

## 2. Hướng dẫn cập nhật dữ liệu (`ward_boundary.geojson` & `features.geojson`)

Dữ liệu địa lý tĩnh được lưu trong thư mục `public/data/`:

### A. Ranh giới phường (`public/data/ward_boundary.geojson`)
- **Định dạng**: GeoJSON (WGS84, `EPSG:4326`), gồm 1 Polygon hoặc MultiPolygon đại diện cho toàn bộ ranh giới Phường Hạc Thành (diện tích sáp nhập báo cáo khoảng ~24.63 km²).
- **Cách cập nhật**:
  1. Xuất file GeoJSON chuẩn WGS84 từ QGIS hoặc nguồn bản đồ hành chính chính thức.
  2. Ghi đè vào file `public/data/ward_boundary.geojson`.
  3. Khi file có polygon hợp lệ, bản đồ sẽ tự động zoom vừa ranh giới (`turf.bbox`) và áp dụng lớp phủ mờ (`turf.mask`) cho toàn bộ khu vực bên ngoài phường.

### B. Dữ liệu quy hoạch (`public/data/features.geojson`)
- **Định dạng**: `FeatureCollection` gồm các Feature polygon/multipolygon với các thuộc tính pháp lý bắt buộc:
  ```json
  {
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [...] },
    "properties": {
      "id": "odt-hacthanh-001",
      "layer": "landuse",
      "category_code": "ODT",
      "admin_unit_id": "phuong-hac-thanh",
      "document_id": "qhsdd-2030-tpth",
      "source_page": 1,
      "effective_date": "2024-01-01",
      "last_checked": "2026-08-01",
      "accuracy_m": 15,
      "version_label": "Quy hoạch điều chỉnh 2024",
      "transitional": true,
      "review_status": "approved"
    }
  }
  ```
- **Chỉ các đối tượng có `review_status: "approved"`** mới được hiển thị và tra cứu ở chế độ công khai.
- **Chế độ xem trước (Preview Mode)**: Truy cập với tham số `?preview=draft` trên URL để xem trước các đối tượng ở trạng thái `draft` và `reviewed` kèm dải băng cảnh báo đỏ "BẢN NHÁP, chưa được duyệt".

---

## 3. Cấu hình triển khai trên Netlify (Netlify Settings)

Dự án được xây dựng dưới dạng ứng dụng tĩnh (Static Single Page Application):

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Form báo sai (Netlify Forms)**:
  - Form ẩn đã được tích hợp sẵn trong `index.html`:
    ```html
    <form name="report-error" data-netlify="true" netlify-honeypot="bot-field" hidden>
      <input name="bot-field" /><input name="lng" /><input name="lat" /><textarea name="message"></textarea><input name="feature_ids" />
    </form>
    ```
  - Khi người dùng gửi báo cáo sai sót dữ liệu qua modal `ReportDialog`, yêu cầu POST sẽ được gửi tự động tới endpoint `/` với mã hóa `application/x-www-form-urlencoded`. Netlify sẽ tự động thu thập vào bảng điều khiển Forms.

---

## 4. Cách chạy trên máy cá nhân (Local Development)

```bash
# Cài đặt thư viện
npm install

# Khởi động máy chủ phát triển
npm run dev

# Kiểm tra bản dựng production
npm run build
```
