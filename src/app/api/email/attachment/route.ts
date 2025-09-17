import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import archiver from "archiver";
import { BackendError, getTenantAccessToken, handleError } from "@/lib/backend-helper";
import { Readable } from "stream";

export async function GET(request: NextRequest) {
    try {
        const email = process.env.FORCE_EMAIL || request.nextUrl.searchParams.get("email");

        if (!email) {
            return BackendError("Missing 'email' query parameter");
        }

        const messageId = request.nextUrl.searchParams.get("message_id") || "";
        const ids = request.nextUrl.searchParams.getAll('attachment_ids');

        const token = await getTenantAccessToken()

        // Split attachment IDs into batches of 20 (API limit)
        const batchSize = 20;
        const batches: string[][] = [];
        for (let i = 0; i < ids.length; i += batchSize) {
            batches.push(ids.slice(i, i + batchSize));
        }

        // Fetch download URLs for all batches
        const allDownloadUrls: Array<{
            download_url: string;
            file_name?: string;
            attachment_id: string;
        }> = [];

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const qs = new URLSearchParams();
            qs.set('email', email);
            qs.set('message_id', messageId);
            batch.forEach(id => qs.append('attachment_ids', id));

            const response = await axios.get(`https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/${email}/messages/${messageId}/attachments/download_url?${qs.toString()}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                },
            });

            if (response.data.data?.download_urls) {
                allDownloadUrls.push(...response.data.data.download_urls);
            }

            // Add delay between requests to respect rate limit (1 req/s)
            if (i < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const zip = archiver("zip", { zlib: { level: 9 } });
        const webStream = Readable.toWeb(zip as unknown as Readable) as unknown as ReadableStream;
        const res = new NextResponse(webStream, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="attachments_${Date.now()}.zip"`,
            },
        });

        (async () => {
            try {
                for (const it of allDownloadUrls) {
                    const url = it.download_url;
                    const filename = it.file_name ?? it.attachment_id;

                    const r = await fetch(url, { cache: "no-store" });
                    if (!r.ok) continue;

                    let resolvedName = filename;
                    const cd = r.headers.get("content-disposition");
                    if (cd) {
                        const fnStarMatch = cd.match(/filename\*=([^;]+)$/i) || cd.match(/filename\*=(?:UTF-8''|"?)([^;\"]+)/i);
                        const fnMatch = cd.match(/filename=("?)([^";]+)\1/i);
                        let headerName: string | undefined;
                        if (fnStarMatch && fnStarMatch[1]) {
                            const raw = fnStarMatch[1].replace(/^UTF-8''/i, '').replace(/^"|"$/g, '');
                            try { headerName = decodeURIComponent(raw); } catch { headerName = raw; }
                        } else if (fnMatch && fnMatch[2]) {
                            headerName = fnMatch[2];
                        }
                        if (headerName && headerName.trim()) {
                            resolvedName = headerName.trim();
                        }
                    }

                    if (!resolvedName || resolvedName === filename) {
                        try {
                            const u = new URL(r.url || url);
                            const last = u.pathname.split('/')?.pop() || '';
                            if (last) {
                                resolvedName = decodeURIComponent(last);
                            }
                        } catch { }
                    }

                    const ab = await r.arrayBuffer();
                    const buf = Buffer.from(ab);
                    zip.append(buf, { name: resolvedName || filename });
                }
                await zip.finalize();
            } catch (e) {
                zip.abort();
                console.error(e);
            }
        })();

        return res;

        // return NextResponse.json(response.data, { status: response.status });
    } catch (e) {
        return handleError(e)
    }
}