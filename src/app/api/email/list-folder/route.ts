import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { BackendError, getTenantAccessToken, handleError } from "@/lib/backend-helper";

export async function GET(request: NextRequest) {
    try {
        const email = process.env.FORCE_EMAIL || request.nextUrl.searchParams.get("email");

        if (!email) {
            return BackendError("Missing ['email'] query parameter");
        }

        const token = await getTenantAccessToken()
        const response = await axios.get(`https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/${email}/folders?folder_type=2`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })

        return NextResponse.json(response.data, { status: response.status });
    } catch (e) {
        return handleError(e)
    }
}