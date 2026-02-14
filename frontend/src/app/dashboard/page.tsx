
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import FolderPicker from "@/components/FolderPicker";
import DriveBrowser from "@/components/DriveBrowser";
import { getWorkingFolder, setWorkingFolder } from "@/app/server/actions";

export default function Dashboard() {
    const { data: session, status } = useSession();
    const [workingFolder, setWorkingFolderState] = useState<{ id: string; name: string; pdfOutputName?: string | null } | null>(null);
    const [loadingFolder, setLoadingFolder] = useState(true);

    useEffect(() => {
        if (status === "authenticated") {
            getWorkingFolder().then((folder) => {
                if (folder?.workingFolderId) {
                    setWorkingFolderState({
                        id: folder.workingFolderId,
                        name: folder.workingFolderName || "My Drive",
                    });
                }
                setLoadingFolder(false);
            });
        } else if (status === "unauthenticated") {
            window.location.href = "/";
        }
    }, [status]);

    if (status === "loading" || loadingFolder) {
        return <div className="flex justify-center items-center h-screen">Loading...</div>;
    }

    if (!session?.accessToken) {
        return <div>Error: No access token found. Please sign out and sign in again.</div>;
    }

    const handleFolderSelect = async (id: string, name: string) => {
        await setWorkingFolder(id, name);
        setWorkingFolderState({ id, name });
    };

    const handleChangeFolder = () => {
        setWorkingFolderState(null);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-6 md:py-10 px-4">
            <header className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-2">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">My Dashboard</h1>
                <div className="flex items-center gap-4 text-sm md:text-base">
                    <span className="text-gray-600">User: {session.user?.name}</span>
                </div>
            </header>

            {!workingFolder ? (
                <FolderPicker accessToken={session.accessToken} onSelect={handleFolderSelect} />
            ) : (
                <DriveBrowser
                    accessToken={session.accessToken}
                    folderId={workingFolder.id}
                    folderName={workingFolder.name}
                    initialPdfName={workingFolder.pdfOutputName || "merged_document"}
                    onChangeFolder={handleChangeFolder}
                />
            )}
        </div>
    );
}
