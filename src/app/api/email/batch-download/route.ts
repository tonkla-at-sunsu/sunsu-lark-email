import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import archiver from "archiver";
import { BackendError, getTenantAccessToken, handleError } from "@/lib/backend-helper";
import { Readable } from "stream";

interface EmailAttachment {
    email_id: string;
    attachment_ids: string[];
}

interface BatchDownloadRequest {
    user_email: string;
    email_attachments: EmailAttachment[];
}

export async function POST(request: NextRequest) {
    try {
        const body: BatchDownloadRequest = await request.json();
        let user_email = body.user_email;
        const email_attachments = body.email_attachments

        if (process.env.FORCE_EMAIL) {
            user_email = process.env.FORCE_EMAIL
        }

        if (!user_email || !email_attachments || email_attachments.length === 0) {
            console.error("Missing required fields:", { user_email, email_attachments });
            return BackendError("Missing required fields");
        }

        const token = await getTenantAccessToken();

        const allDownloadUrls: Array<{
            download_url: string;
            file_name?: string;
            attachment_id: string;
            email_id: string;
        }> = [];

        for (const emailAttachment of email_attachments) {
            const { email_id, attachment_ids } = emailAttachment;

            if (attachment_ids.length === 0) continue;

            const batchSize = 20;
            const batches: string[][] = [];
            for (let i = 0; i < attachment_ids.length; i += batchSize) {
                batches.push(attachment_ids.slice(i, i + batchSize));
            }

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const qs = new URLSearchParams();
                batch.forEach(id => qs.append('attachment_ids', id));

                try {
                    const requestUrl = `https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/${user_email}/messages/${email_id}/attachments/download_url?${qs.toString()}`;
                    const response = await axios.get(requestUrl, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        },
                    });

                    if (response.data.data?.download_urls) {
                        const urlsWithEmailId = response.data.data.download_urls.map((url: { download_url: string; file_name?: string; attachment_id: string }) => ({
                            ...url,
                            email_id: email_id
                        }));
                        allDownloadUrls.push(...urlsWithEmailId);
                    } else {
                        console.warn(`No download URLs found for email ${email_id}`);
                    }
                } catch (error) {
                    console.error(`Error getting download URLs for email ${email_id}:`, error);
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (allDownloadUrls.length === 0) {
            return BackendError("No attachments found to download");
        }

        const zip = archiver("zip", { zlib: { level: 9 } });
        const webStream = Readable.toWeb(zip as unknown as Readable) as unknown as ReadableStream;
        const res = new NextResponse(webStream, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="email-attachments-${new Date().toISOString().slice(0, 10)}.zip"`,
            },
        });

        (async () => {
            try {
                const failedDownloads: Array<{
                    email_id: string;
                    attachment_id: string;
                    filename: string;
                    error: string;
                }> = [];

                const successfulDownloads: Array<{
                    email_id: string;
                    attachment_id: string;
                    filename: string;
                    file_size: number;
                }> = [];

                const usedFileNames = new Set<string>();

                for (const it of allDownloadUrls) {
                    const url = it.download_url;
                    const filename = it.file_name ?? it.attachment_id;

                    try {
                        const r = await fetch(url, { cache: "no-store" });
                        if (!r.ok) {
                            failedDownloads.push({
                                email_id: it.email_id,
                                attachment_id: it.attachment_id,
                                filename: filename,
                                error: `HTTP ${r.status}: ${r.statusText}`
                            });
                            continue;
                        }

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

                        let finalFileName = resolvedName || filename;
                        let index = 1;
                        while (usedFileNames.has(finalFileName)) {
                            const nameWithoutExt = finalFileName.replace(/\.[^/.]+$/, "");
                            const ext = finalFileName.match(/\.[^/.]+$/)?.[0] || "";
                            finalFileName = `${nameWithoutExt}-${index}${ext}`;
                            index++;
                        }
                        usedFileNames.add(finalFileName);

                        zip.append(buf, { name: finalFileName });
                        console.log(`Added to zip: ${finalFileName}`);

                        successfulDownloads.push({
                            email_id: it.email_id,
                            attachment_id: it.attachment_id,
                            filename: finalFileName,
                            file_size: buf.length
                        });
                    } catch (fetchError) {
                        failedDownloads.push({
                            email_id: it.email_id,
                            attachment_id: it.attachment_id,
                            filename: filename,
                            error: fetchError instanceof Error ? fetchError.message : 'Unknown error'
                        });
                        console.error(`Failed to download ${filename}:`, fetchError);
                    }
                }

                if (successfulDownloads.length > 0) {
                    const totalSize = successfulDownloads.reduce((sum, file) => sum + file.file_size, 0);
                    const formatBytes = (bytes: number) => {
                        if (bytes === 0) return '0 Bytes';
                        const k = 1024;
                        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                    };

                    const summaryReport = `สรุปการดาวน์โหลดไฟล์แนบ\n` +
                        `=====================================\n\n` +
                        `วันที่: ${new Date().toLocaleString('th-TH')}\n` +
                        `จำนวนไฟล์ที่ดาวน์โหลดสำเร็จ: ${successfulDownloads.length} ไฟล์\n` +
                        `ขนาดรวม: ${formatBytes(totalSize)}\n\n` +
                        `รายละเอียดไฟล์:\n` +
                        successfulDownloads.map((file, index) =>
                            `${index + 1}. ${file.filename}\n` +
                            `   - Email ID: ${file.email_id}\n` +
                            `   - ขนาด: ${formatBytes(file.file_size)}\n` +
                            `   - Attachment ID: ${file.attachment_id}\n`
                        ).join('\n');

                    zip.append(Buffer.from(summaryReport, 'utf-8'), { name: 'download-summary.txt' });
                    console.log(`Created summary report for ${successfulDownloads.length} successful downloads`);
                }

                if (failedDownloads.length > 0) {
                    const errorReport = `รายงานไฟล์ที่ดาวน์โหลดไม่ได้ (${failedDownloads.length} ไฟล์):\n\n` +
                        failedDownloads.map(f =>
                            `- Email ID: ${f.email_id}\n  ไฟล์: ${f.filename}\n  ข้อผิดพลาด: ${f.error}\n`
                        ).join('\n') +
                        `\nคำแนะนำ:\n` +
                        `1. ลองกดดาวน์โหลดใหม่อีกครั้ง\n` +
                        `2. ลดจำนวนไฟล์ที่เลือกลง\n` +
                        `3. ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต\n` +
                        `4. ลองดาวน์โหลดทีละไฟล์แทน\n`;

                    zip.append(Buffer.from(errorReport, 'utf-8'), { name: 'download-errors.txt' });
                    console.log(`Created error report for ${failedDownloads.length} failed downloads`);
                }

                await zip.finalize();
            } catch (e) {
                console.error("Error in zip creation:", e);
                zip.abort();
            }
        })();

        return res;
    } catch (e) {
        return handleError(e);
    }
}
