import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { BackendError, getTenantAccessToken, handleError } from "@/lib/backend-helper";

export async function GET(request: NextRequest) {
    try {
        const email = process.env.FORCE_EMAIL || request.nextUrl.searchParams.get("email");

        if (!email) {
            return BackendError("Missing 'email' query parameter");
        }

        const pageSize = request.nextUrl.searchParams.get("page_size") || "20";
        const folderId = request.nextUrl.searchParams.get("folder_id") || "INBOX";

        const token = await getTenantAccessToken()

        const response = await axios.get(`https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/${email}/messages`, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            params: {
                page_size: pageSize,
                folder_id: folderId
            }
        })

        return NextResponse.json(response.data, { status: response.status });
    } catch (e) {
        return handleError(e)
    }
}