"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { setPdfName } from "@/app/server/actions";

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
}

interface DriveBrowserProps {
    accessToken: string;
    folderId: string;
    folderName: string;
    initialPdfName: string;
    onChangeFolder: () => void;
}

// Helper to check if file is a folder
const isFolder = (mimeType: string) => mimeType === "application/vnd.google-apps.folder";

// Recursive Tree Node
const FileTreeNode = ({
    file,
    accessToken,
    level,
    selectedFiles,
    toggleFile,
}: {
    file: DriveFile;
    accessToken: string;
    level: number;
    selectedFiles: string[];
    toggleFile: (file: DriveFile) => void;
}) => {
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const fetchChildren = async () => {
        if (loaded) return;
        setLoading(true);
        try {
            const q = `'${file.id}' in parents and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or name contains '.ipynb') and trashed = false`;
            const response = await axios.get(`https://www.googleapis.com/drive/v3/files`, {
                params: {
                    q,
                    fields: "files(id, name, mimeType, webViewLink)",
                    orderBy: "name",
                },
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            setChildren(response.data.files || []);
            setLoaded(true);
        } catch (error) {
            console.error("Error fetching children", error);
        } finally {
            setLoading(false);
        }
    };

    const handleExpand = () => {
        if (isFolder(file.mimeType)) {
            if (!expanded) {
                fetchChildren();
            }
            setExpanded(!expanded);
        }
    };

    const isSelected = selectedFiles.includes(file.id);

    return (
        <div className="select-none">
            <div
                className={`flex items-center py-2 px-2 hover:bg-gray-50 border-b border-gray-100 transition-colors ${isSelected ? "bg-blue-50" : ""
                    }`}
                style={{ paddingLeft: `${level * 20 + 8}px` }}
            >
                {isFolder(file.mimeType) ? (
                    <button
                        onClick={handleExpand}
                        className="mr-2 text-gray-500 hover:text-gray-800 focus:outline-none"
                    >
                        {expanded ? "▼" : "▶"}
                    </button>
                ) : (
                    <input
                        type="checkbox"
                        className="mr-2 h-4 w-4"
                        checked={isSelected}
                        onChange={() => toggleFile(file)}
                    />
                )}

                <div className="flex-1 flex max-w-full items-center">
                    <span
                        className={`truncate mr-2 ${isFolder(file.mimeType) ? "font-bold text-gray-700 cursor-pointer" : "text-gray-800"}`}
                        onClick={isFolder(file.mimeType) ? handleExpand : undefined}
                    >
                        {isFolder(file.mimeType) ? "📁 " :
                            file.mimeType.includes("ipynb") ? "📓 " : "📄 "}
                        {file.name}
                    </span>

                    {/* Show link only for files */}
                    {!isFolder(file.mimeType) && (
                        <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto text-xs text-blue-500 hover:text-blue-700 font-semibold px-2"
                        >
                            Edit ↗
                        </a>
                    )}
                </div>
            </div>

            {expanded && (
                <div>
                    {loading ? (
                        <div className="py-2 text-gray-400 text-sm" style={{ paddingLeft: `${(level + 1) * 20 + 8}px` }}>Loading...</div>
                    ) : children.length === 0 ? (
                        <div className="py-2 text-gray-400 text-sm" style={{ paddingLeft: `${(level + 1) * 20 + 8}px` }}>No compatible files</div>
                    ) : (
                        children.map((child) => (
                            <FileTreeNode
                                key={child.id}
                                file={child}
                                accessToken={accessToken}
                                level={level + 1}
                                selectedFiles={selectedFiles}
                                toggleFile={toggleFile}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};


export default function DriveBrowser({
    accessToken,
    folderId,
    folderName,
    initialPdfName,
    onChangeFolder,
}: DriveBrowserProps) {
    const [rootFiles, setRootFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [pdfName, setPdfNameState] = useState(initialPdfName);

    // Store selected files as an array to verify order? 
    // Map or array of objects is better to storing mimeType for sorting.
    // Actually, we can just store the full file object.
    // Debounced Save
    useEffect(() => {
        const handler = setTimeout(() => {
            if (pdfName && pdfName !== initialPdfName) {
                savePdfName(pdfName);
            }
        }, 1000); // 1 second debounce

        return () => {
            clearTimeout(handler);
        };
    }, [pdfName]);

    const savePdfName = async (name: string) => {
        try {
            await setPdfName(name);
            console.log("Saved preference:", name);
        } catch (e) {
            console.error("Failed to save preference", e);
        }
    };

    const [selectedFileObjects, setSelectedFileObjects] = useState<DriveFile[]>([]);

    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        fetchRootFiles();
        // Reset selection when changing root folder? Maybe keeps it? 
        // The user might want to select files from one working folder. 
        // If they change "Working Directory", they are resetting context.
        setSelectedFileObjects([]);
    }, [folderId]);

    const fetchRootFiles = async () => {
        setLoading(true);
        try {
            // Include folders in the query now
            const q = `'${folderId}' in parents and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or name contains '.ipynb') and trashed = false`;

            const response = await axios.get(`https://www.googleapis.com/drive/v3/files`, {
                params: {
                    q,
                    fields: "files(id, name, mimeType, webViewLink)",
                    orderBy: "name",
                },
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            setRootFiles(response.data.files || []);
        } catch (error) {
            console.error("Error fetching files", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleFile = (file: DriveFile) => {
        setSelectedFileObjects((prev) => {
            const exists = prev.find(f => f.id === file.id);
            if (exists) {
                return prev.filter(f => f.id !== file.id);
            } else {
                return [...prev, file];
            }
        });
    };

    const handleMerge = async () => {
        if (selectedFileObjects.length === 0) return;
        setProcessing(true);

        // Sort logic: 
        // 1. Non-Notebooks first (Word, Docs)
        // 2. Notebooks last
        // Within groups, preserve selection order (or alphabetical? User said "In that order they will go")
        // Assuming "Selection Order" refers to the order user clicked them IF we tracked it.
        // But `selectedFileObjects` array DOES preserve insertion order (push to end).
        // So we just need to stable sort/partition.

        // Partition
        const notebooks = selectedFileObjects.filter(f => f.mimeType.includes("ipynb") || f.name.endsWith(".ipynb"));
        const others = selectedFileObjects.filter(f => !(f.mimeType.includes("ipynb") || f.name.endsWith(".ipynb")));

        // Combine: Others first, then Notebooks
        const sortedFiles = [...others, ...notebooks];
        const sortedIds = sortedFiles.map(f => f.id);

        try {
            // Use relative path for proxy
            const response = await axios.post(
                "/py-api/process-drive-files",
                {
                    token: accessToken,
                    file_ids: sortedIds,
                    filename: pdfName || "merged_document",
                },
                {
                    responseType: "blob",
                }
            );

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `${pdfName || "merged_document"}.pdf`); // Use the custom name
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
        } catch (error) {
            console.error("Error merging files", error);
            alert("Failed to merge files. Please check backend logs.");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-xl w-full max-w-5xl h-[85vh] md:h-[80vh] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 border-b pb-4 shrink-0 gap-4">
                <div className="w-full md:w-auto">
                    <span className="text-gray-500 text-xs uppercase tracking-wider block">Working Directory</span>
                    <h2 className="text-lg md:text-xl font-bold text-gray-800 break-all leading-tight">{folderName}</h2>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-end gap-3 w-full md:w-auto">
                    <div className="flex flex-col w-full md:w-auto">
                        <span className="text-xs text-gray-500 uppercase tracking-wider mb-1">Output Filename</span>
                        <input
                            type="text"
                            value={pdfName}
                            onChange={(e) => setPdfNameState(e.target.value)}
                            className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 w-full md:w-56 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
                            placeholder="merged_document"
                        />
                    </div>
                    <button
                        onClick={onChangeFolder}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium border border-blue-200 px-4 py-2 rounded hover:bg-blue-50 transition w-full md:w-auto text-center"
                    >
                        Change Folder
                    </button>
                </div>
            </div>

            <div className="mb-4 flex justify-between items-center shrink-0 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="flex flex-col">
                    <h3 className="text-sm font-bold text-gray-700">Selected: {selectedFileObjects.length} files</h3>
                    <span className="text-xs text-gray-500">
                        (Docs will be merged first, Notebooks last)
                    </span>
                </div>

                <button
                    onClick={handleMerge}
                    disabled={processing || selectedFileObjects.length === 0}
                    className={`px-6 py-2 rounded-lg font-bold text-white shadow-md transition-all transform active:scale-95 ${processing || selectedFileObjects.length === 0
                        ? "bg-gray-400 cursor-not-allowed opacity-70"
                        : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg"
                        }`}
                >
                    {processing ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processing...
                        </span>
                    ) : (
                        "Convert & Merge"
                    )}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-xl bg-white shadow-inner custom-scrollbar relative">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-400 mb-2"></div>
                        <p>Loading folder contents...</p>
                    </div>
                ) : rootFiles.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        No compatible files or folders found.
                    </div>
                ) : (
                    <div className="min-w-full inline-block align-middle">
                        {rootFiles.map((file) => (
                            <FileTreeNode
                                key={file.id}
                                file={file}
                                accessToken={accessToken}
                                level={0}
                                selectedFiles={selectedFileObjects.map(f => f.id)}
                                toggleFile={toggleFile}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Selected Files Preview Footer */}
            {selectedFileObjects.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 shrink-0 max-h-32 overflow-y-auto">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Merge Order Preview</h4>
                    <div className="space-y-1">
                        {/* Preview the sorted order */}
                        {[...selectedFileObjects.filter(f => !(f.mimeType.includes("ipynb") || f.name.endsWith(".ipynb"))),
                        ...selectedFileObjects.filter(f => f.mimeType.includes("ipynb") || f.name.endsWith(".ipynb"))
                        ].map((f, i) => (
                            <div key={f.id} className="text-xs text-gray-600 flex items-center">
                                <span className="w-6 text-gray-400 font-mono">{i + 1}.</span>
                                {f.mimeType.includes("ipynb") ? "📓" : "📄"} {f.name}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
