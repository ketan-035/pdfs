
"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function setWorkingFolder(folderId: string, folderName: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) throw new Error("Unauthorized");

    await prisma.user.update({
        where: { email: session.user.email },
        data: {
            workingFolderId: folderId,
            workingFolderName: folderName,
        },
    });
}

export async function getWorkingFolder() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return null;

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { workingFolderId: true, workingFolderName: true, pdfOutputName: true },
    });

    return user;
}

export async function setPdfName(name: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) throw new Error("Unauthorized");

    await prisma.user.update({
        where: { email: session.user.email },
        data: {
            pdfOutputName: name,
        },
    });
}
