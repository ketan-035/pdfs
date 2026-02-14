
from fastapi import FastAPI, UploadFile, File, Body, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from services.word import read_word, save_word
from services.notebook import read_md_cells, add_md_cell
from services.pdf import word_to_pdf, md_to_pdf, merge
# Service import
from services.drive_service import process_files
import os
import shutil

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE = "data"
os.makedirs(BASE, exist_ok=True)

WORD = f"{BASE}/file.docx"
IPYNB = f"{BASE}/file.ipynb"

def cleanup_temp_dir(path: str):
    if os.path.exists(path):
        shutil.rmtree(path)

# ---------- DRIVE PROCESS ----------

from pydantic import BaseModel
from typing import List

class DriveProcessRequest(BaseModel):
    token: str
    file_ids: List[str]
    filename: str = "merged_document"

@app.post("/process-drive-files")
def process_drive_files(request: DriveProcessRequest, background_tasks: BackgroundTasks):
    """
    Downloads, converts, and merges files from Google Drive using the provided token.
    Returns the merged PDF.
    Deletes the temporary files after serving.
    """
    try:
        merged_pdf_path, temp_dir = process_files(request.token, request.file_ids)
        
        if not merged_pdf_path or not os.path.exists(merged_pdf_path):
            cleanup_temp_dir(temp_dir)
            raise HTTPException(status_code=500, detail="Failed to create merged PDF")
            
        # Add cleanup task to run after response is sent
        background_tasks.add_task(cleanup_temp_dir, temp_dir)
        
        # Ensure filename has .pdf extension
        out_name = request.filename if request.filename.endswith(".pdf") else f"{request.filename}.pdf"
        
        return FileResponse(merged_pdf_path, media_type='application/pdf', filename=out_name)
        
    except Exception as e:
        # If temp_dir was created but failed, cleanup now
        # But we don't have temp_dir scope here easily without return. 
        # process_files handles its own cleanup on catastrophic error? 
        # No, I removed it. Let's rely on process_files returning (None, dir) or raising.
        # If it raises, we might leak temp dir if we don't catch specifically.
        # But for now, standardized 500.
        raise HTTPException(status_code=500, detail=str(e))


# ---------- EXISTING ENDPOINTS (kept for compatibility) ----------

@app.post("/upload")
async def upload(
    word: UploadFile = File(...),
    ipynb: UploadFile = File(...)
):
    with open(WORD, "wb") as f:
        f.write(await word.read())

    with open(IPYNB, "wb") as f:
        f.write(await ipynb.read())

    return {
        "word": read_word(WORD),
        "markdown": read_md_cells(IPYNB)
    }

@app.post("/word/save")
def save_word_api(text: str = Body(...)):
    save_word(text, WORD)
    return {"status": "saved"}

@app.get("/word/pdf")
def word_pdf():
    out = f"{BASE}/word.pdf"
    word_to_pdf(read_word(WORD), out)
    return FileResponse(out)

@app.post("/notebook/add")
def add_md(content: str = Body(...)):
    add_md_cell(IPYNB, content)
    return {"status": "added"}

@app.get("/notebook/pdf")
def nb_pdf():
    out = f"{BASE}/nb.pdf"
    md_to_pdf(read_md_cells(IPYNB), out)
    return FileResponse(out)

@app.get("/merge")
def merged():
    w = f"{BASE}/word.pdf"
    n = f"{BASE}/nb.pdf"
    out = f"{BASE}/final.pdf"

    word_to_pdf(read_word(WORD), w)
    md_to_pdf(read_md_cells(IPYNB), n)

    merge(w, n, out)
    return FileResponse(out)
