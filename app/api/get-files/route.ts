import { NextResponse } from 'next/server';
import { parseNoteFileNames } from "@/app/utils/DirectoryParser";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const dirName = searchParams.get("dir");
    if (!dirName) {
        return NextResponse.json({ status: 400, statusText: "No directory name provided" });
    }
    const noteFilenames = parseNoteFileNames(decodeURIComponent(dirName));
    return Response.json({ files: noteFilenames , status: 200, statusText: "OK" });
}
