
"use client";

import { useState, useEffect } from "react";
import axios from "axios";

interface Folder {
    id: string;
    name: string;
}

interface FolderPickerProps {
    accessToken: string;
    onSelect: (folderId: string, folderName: string) => void;
}

export default function FolderPicker({ accessToken, onSelect }: FolderPickerProps) {
    const [currentFolderId, setCurrentFolderId] = useState("root");
    const [folders, setFolders] = useState<Folder[]>([]);
    const [history, setHistory] = useState<{ id: string; name: string }[]>([
        { id: "root", name: "My Drive" },
    ]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchFolders(currentFolderId);
    }, [currentFolderId]);

    const fetchFolders = async (parentId: string) => {
        setLoading(true);
        try {
            const response = await axios.get(
                `https://www.googleapis.com/drive/v3/files`,
                {
                    params: {
                        q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                        fields: "files(id, name)",
                        orderBy: "name",
                    },
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );
            setFolders(response.data.files);
        } catch (error) {
            console.error("Error fetching folders", error);
        } finally {
            setLoading(false);
        }
    };

    const traverse = (folder: Folder) => {
        setHistory([...history, folder]);
        setCurrentFolderId(folder.id);
    };

    const goBack = () => {
        if (history.length <= 1) return;
        const newHistory = [...history];
        newHistory.pop();
        setHistory(newHistory);
        setCurrentFolderId(newHistory[newHistory.length - 1].id);
    };

    const currentName = history[history.length - 1].name;

    return (
        <div className="bg-white text-gray-800 p-4 md:p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4 md:mx-0">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Select Working Directory</h2>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 bg-gray-100 p-3 rounded gap-3">
                <div className="overflow-hidden w-full md:w-auto">
                    {history.length > 1 && (
                        <button onClick={goBack} className="mr-2 text-blue-500 hover:text-blue-700 font-bold">
                            &lt; Back
                        </button>
                    )}
                    <span className="font-mono text-sm break-all">{history.map(h => h.name).join(" / ")}</span>
                </div>
                <button
                    onClick={() => onSelect(currentFolderId, currentName)}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-bold w-full md:w-auto shrink-0"
                >
                    Select "{currentName}"
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
            ) : (
                <ul className="max-h-96 overflow-y-auto border rounded">
                    {folders.length === 0 && (
                        <li className="p-4 text-gray-500 text-center">No subfolders found.</li>
                    )}
                    {folders.map((folder) => (
                        <li
                            key={folder.id}
                            className="border-b last:border-0 p-3 hover:bg-blue-50 cursor-pointer flex items-center"
                            onClick={() => traverse(folder)}
                        >
                            <span className="mr-3 text-yellow-500">📁</span>
                            {folder.name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
