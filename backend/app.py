import os
import shutil
import uuid
import re  # Tambahan untuk Regular Expression (Natural Sorting)
from pathlib import Path
from zipfile import ZipFile
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from PIL import Image

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = Path(os.getcwd()) / 'temp_uploads'
UPLOAD_FOLDER.mkdir(exist_ok=True)
app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)

# Fungsi bantuan untuk Natural Sorting


def natural_sort_key(s):
    """
    Memecah string menjadi list berisi teks dan integer.
    Contoh: "page10.jpg" -> ["page", 10, ".jpg"]
    Ini memastikan angka 2 berada sebelum 10.
    """
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]


@app.route('/api/convert', methods=['POST'])
def convert_files():
    target_format = request.form.get('format', 'JPG').upper()
    export_pdf_str = request.form.get('isExportPdf', 'false').lower()
    export_pdf = export_pdf_str == 'true'

    if 'files' not in request.files:
        return jsonify({'success': False, 'errorCode': "400 Bad Request"}), 400

    uploaded_files = request.files.getlist('files')
    results = []

    for file in uploaded_files:
        if file.filename == '' or not file.filename.lower().endswith('.zip'):
            continue

        filename = secure_filename(file.filename)
        save_path = Path(app.config['UPLOAD_FOLDER']) / filename
        file.save(str(save_path))

        # 1. Buat folder kerja unik (UUID)
        task_id = str(uuid.uuid4())
        work_dir = Path(app.config['UPLOAD_FOLDER']) / task_id
        work_dir.mkdir()

        try:
            # 2. Ekstrak ZIP yang diupload
            with ZipFile(save_path, 'r') as zipf:
                zipf.extractall(work_dir)

            converted_files = []
            images_for_pdf = []

            # 3. KUMPULKAN DAN URUTKAN FILE (NATURAL SORT)
            # Ambil semua file gambar terlebih dahulu ke dalam list
            valid_extensions = ['.webp', '.jpg', '.jpeg', '.png']
            all_images = [f for f in work_dir.rglob(
                '*') if f.is_file() and f.suffix.lower() in valid_extensions]

            # Urutkan list menggunakan natural_sort_key berdasarkan nama file
            all_images.sort(key=lambda x: natural_sort_key(x.name))

            # 4. Proses iterasi gambar (Sekarang sudah berurutan dengan benar)
            for img_file in all_images:
                try:
                    img = Image.open(img_file)

                    if target_format == 'JPG':
                        img_converted = img.convert('RGB')
                        ext = '.jpg'
                        save_format = 'JPEG'
                    else:
                        img_converted = img.convert('RGBA')
                        ext = '.png'
                        save_format = 'PNG'

                    new_name = f"{img_file.stem}_converted{ext}"
                    out_path = work_dir / new_name

                    img_converted.save(out_path, save_format)
                    converted_files.append(out_path)

                    if export_pdf:
                        images_for_pdf.append(
                            Image.open(out_path).convert('RGB'))

                except Exception as e:
                    print(f"Error processing {img_file.name}: {e}")

            final_file_name = ""

            # 5. Output PDF atau ZIP
            if export_pdf and images_for_pdf:
                final_file_name = f"{filename.rsplit('.', 1)[0]}_merged.pdf"
                final_file_path = Path(
                    app.config['UPLOAD_FOLDER']) / final_file_name

                # Gambar sudah urut, sehingga halaman PDF akan urut
                images_for_pdf[0].save(
                    str(final_file_path),
                    save_all=True,
                    append_images=images_for_pdf[1:],
                    quality=100
                )
            else:
                final_file_name = f"result_{filename}"
                final_file_path = Path(
                    app.config['UPLOAD_FOLDER']) / final_file_name

                with ZipFile(final_file_path, 'w') as zipf:
                    for f in converted_files:
                        zipf.write(f, f.name)

            # 6. Buat URL Download
            download_url = f"http://127.0.0.1:5000/api/download/{final_file_name}"

            results.append({
                'originalName': filename,
                'newName': final_file_name,
                'status': 'Success',
                'url': download_url
            })

        except Exception as e:
            print(f"Error handling zip {filename}: {e}")
            results.append({
                'originalName': filename,
                'newName': "-",
                'status': 'Failed',
                'url': None
            })

        finally:
            # 7. CLEANUP
            if save_path.exists():
                os.remove(save_path)
            if work_dir.exists():
                shutil.rmtree(work_dir)

    if not results:
        return jsonify({'success': False, 'errorCode': "No valid files processed"}), 400

    return jsonify({'success': True, 'results': results}), 200


@app.route('/api/download/<filename>', methods=['GET'])
def download_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)
    except Exception as e:
        return jsonify({'success': False, 'errorCode': "File not found"}), 404


if __name__ == '__main__':
    print(f"🚀 Server berjalan! Folder temp: {app.config['UPLOAD_FOLDER']}")
    app.run(debug=True, port=5000)
