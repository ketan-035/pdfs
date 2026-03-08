
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io
import os
import shutil
import uuid
from services.pdf import word_to_pdf, md_to_pdf
from PyPDF2 import PdfReader, PdfWriter
import nbformat
from nbconvert import HTMLExporter
from xhtml2pdf import pisa
from docx2pdf import convert
from docx import Document
import subprocess
import platform
import shutil

# Define scopes (consistent with frontend)
SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly', 'https://www.googleapis.com/auth/drive.file']

def download_file(service, file_id, mime_type, destination):
    """
    Downloads a file from Drive.
    If it's a Google Doc, export as PDF.
    If it's a binary file (docx, ipynb), download as is.
    """
    try:
        request = None
        is_google_doc = 'application/vnd.google-apps' in mime_type and 'folder' not in mime_type
        
        if is_google_doc:
            # Export Google Doc to PDF directly
            request = service.files().export_media(fileId=file_id, mimeType='application/pdf')
            filename = destination + ".pdf"
        else:
            # Download binary file
            request = service.files().get_media(fileId=file_id)
            # Determine extension based on mimeType if needed, but we trust the requested file extension from processing loop
            filename = destination 

        fh = io.FileIO(filename, 'wb')
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        
        return filename
    except Exception as e:
        print(f"Error downloading {file_id}: {e}")
        return None

def process_files(token, file_ids):
    """
    Main logic:
    1. Authenticate.
    2. Download files to temp dir.
    3. Convert to PDF.
    4. Merge.
    5. Return path to merged PDF, and temp dir for cleanup.
    """
    creds = Credentials(token=token, scopes=SCOPES)
    service = build('drive', 'v3', credentials=creds)
    
    session_id = str(uuid.uuid4())
    temp_dir = os.path.join("data", session_id)
    os.makedirs(temp_dir, exist_ok=True)
    
    pdf_files = []
    
    try:
        if isinstance(file_ids, str):
            file_ids = [file_ids]

        for fid in file_ids:
            # Get metadata
            try:
                meta = service.files().get(fileId=fid, fields="id, name, mimeType").execute()
            except Exception as e:
                print(f"Failed to get metadata for {fid}: {e}")
                continue

            name = meta.get('name')
            mime = meta.get('mimeType')
            
            # Destination path (preserve extension if possible)
            local_path = os.path.join(temp_dir, name)
            
            is_word_file = (mime == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or name.lower().endswith('.docx'))
            if is_word_file:
                print(f"File {name} is a Word Document. Converting directly via Google Drive API for perfect fidelity.")
                try:
                    # 1. Copy and convert to a native fluid Google Doc
                    copy_metadata = {
                        'name': f"Temp_Convert_{name}",
                        'mimeType': 'application/vnd.google-apps.document'
                    }
                    copied_file = service.files().copy(fileId=fid, body=copy_metadata).execute()
                    copied_id = copied_file.get('id')
                    
                    try:
                        # 2. Let Google cleanly paginate and export the natively converted doc to PDF
                        pdf_path = os.path.splitext(local_path)[0] + ".pdf"
                        request = service.files().export_media(fileId=copied_id, mimeType='application/pdf')
                        fh = io.FileIO(pdf_path, 'wb')
                        downloader = MediaIoBaseDownload(fh, request)
                        done = False
                        while done is False:
                            status, done = downloader.next_chunk()
                        
                        pdf_files.append(pdf_path)
                        print(f"Successfully converted {name} to natively paginated PDF.")
                        continue # Skip local download/conversion entirely!
                    finally:
                        # 3. Destroy exactly what we created, leaving the User's drive completely unaffected
                        try:
                            service.files().delete(fileId=copied_id).execute()
                        except Exception as delete_ex:
                            print(f"Could not delete temporary conversion doc {copied_id}: {delete_ex}")
                except Exception as ex:
                    print(f"Native Google Drive conversion failed: {ex}. Falling back to local conversion...")
            
            # Download
            downloaded_path = download_file(service, fid, mime, local_path)
            
            if not downloaded_path:
                continue
                
            # Convert to PDF
            final_pdf = None
            
            if downloaded_path.lower().endswith('.pdf'):
                final_pdf = downloaded_path
            
            elif downloaded_path.lower().endswith('.docx'):
                pdf_path = os.path.splitext(downloaded_path)[0] + ".pdf"
                try:
                    # Try docx2pdf (Works on Windows/macOS with Word installed)
                    try:
                        if platform.system() == "Windows":
                            import pythoncom
                            pythoncom.CoInitialize()
                            print(f"Trying docx2pdf on {downloaded_path}...")
                            
                        convert(downloaded_path, pdf_path)
                        
                        if os.path.exists(pdf_path):
                            final_pdf = pdf_path
                        else:
                            raise Exception("docx2pdf finished but pdf not found")
                            
                    except Exception as e:
                        print(f"docx2pdf failed: {e}. Trying LibreOffice...")
                        
                        # Find LibreOffice binary
                        soffice_bin = "libreoffice"
                        if platform.system() == "Windows":
                            paths = [
                                r"C:\Program Files\LibreOffice\program\soffice.exe",
                                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"
                            ]
                            for p in paths:
                                if os.path.exists(p):
                                    soffice_bin = p
                                    break
                        else:
                            soffice_bin = shutil.which("libreoffice") or shutil.which("soffice") or "libreoffice"
                            
                        # Set up isolated home environment for HF spaces constraints
                        run_env = os.environ.copy()
                        run_env["HOME"] = "/tmp"

                        print(f"Running LibreOffice with binary: {soffice_bin}")
                        subprocess.run([
                            soffice_bin, '--headless', '--convert-to', 'pdf', 
                            '--outdir', temp_dir, downloaded_path
                        ], check=True, env=run_env)
                        
                        # LibreOffice outputs to --outdir, using the original base filename
                        lo_expected_pdf = os.path.join(temp_dir, os.path.splitext(os.path.basename(downloaded_path))[0] + ".pdf")
                        
                        if os.path.exists(lo_expected_pdf):
                            final_pdf = lo_expected_pdf
                        elif os.path.exists(pdf_path):
                            final_pdf = pdf_path
                        else:
                            raise Exception("LibreOffice returned success but PDF file not found")
                            
                except Exception as e:
                    print(f"LibreOffice/Conversion failed: {e}. Fallback to text extraction.")
                    try:
                        # Fallback: text extraction using python-docx
                        doc = Document(downloaded_path)
                        text = "\n".join([p.text for p in doc.paragraphs])
                        word_to_pdf(text, pdf_path)
                        final_pdf = pdf_path
                    except Exception as ex:
                        print(f"Fallback failed: {ex}")

            elif downloaded_path.lower().endswith('.ipynb'):
                pdf_path = os.path.splitext(downloaded_path)[0] + ".pdf"
                try:
                    # Convert IPYNB to HTML then PDF
                    from pygments.formatters import HtmlFormatter
                    
                    with open(downloaded_path, 'r', encoding='utf-8') as f:
                        notebook = nbformat.read(f, as_version=4)
                    
                    # Use 'basic' template to get raw HTML structure without complex Jupyter Lab CSS
                    html_exporter = HTMLExporter(template_name="basic")
                    (body, resources) = html_exporter.from_notebook_node(notebook)
                    
                    # Create CSS for syntax highlighting using 'friendly' style (light background, colorful code)
                    # .highlight class is what nbconvert uses by default
                    formatter = HtmlFormatter(style='friendly')
                    css = formatter.get_style_defs('.highlight')
                    
                    # Wrap in full HTML document with the CSS
                    full_html = f"""
                    <html>
                    <head>
                        <style>
                            {css}
                            /* Extra basic styling for readability */
                            body {{ font-family: Helvetica, sans-serif; font-size: 10pt; }}
                            pre {{ background-color: #f0f0f0; padding: 5px; border-radius: 3px; }}
                            .input_prompt {{ color: #000080; }}
                            .output_prompt {{ color: #800000; }}
                        </style>
                    </head>
                    <body>
                        {body}
                    </body>
                    </html>
                    """
                    
                    with open(pdf_path, "wb") as pdf_file:
                        pisa_status = pisa.CreatePDF(full_html, dest=pdf_file)
                        
                    if not pisa_status.err:
                        final_pdf = pdf_path
                except Exception as e:
                    print(f"Notebook conversion failed: {e}")
                    # Fallback: extract markdown cells
                    try: 
                        from services.notebook import read_md_cells
                        cells = read_md_cells(downloaded_path)
                        md_to_pdf(cells, pdf_path)
                        final_pdf = pdf_path
                    except Exception as ex:
                         print(f"Fallback failed: {ex}")
            
            if final_pdf and os.path.exists(final_pdf):
                pdf_files.append(final_pdf)

        # Merge
        if not pdf_files:
            return None, temp_dir
            
        final_merged_path = os.path.join(temp_dir, "merged_final.pdf")
        
        merger = PdfWriter()
        for pdf in pdf_files:
            try:
                reader = PdfReader(pdf)
                merger.append(reader)
            except Exception as e:
                print(f"Error merging {pdf}: {e}")
        
        merger.write(final_merged_path)
        merger.close()
        
        return final_merged_path, temp_dir

    except Exception as e:
        print(f"Global error in process_files: {e}")
        # Dont delete yet, handled by caller
        raise e
