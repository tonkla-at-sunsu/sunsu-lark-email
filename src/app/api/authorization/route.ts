import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { BackendError, handleError } from "@/lib/backend-helper";

export async function GET(request: NextRequest) {
    try {
        const code = request.nextUrl.searchParams.get("code");

        if (!code) {
            return BackendError("Missing 'code' query parameter");
        }

        const redirectUri = `${request.nextUrl.origin}/callback`;

        const payload = {
            "grant_type": "authorization_code",
            "client_id": process.env.NEXT_PUBLIC_APP_ID,
            "client_secret": process.env.APP_SECRET,
            "redirect_uri": redirectUri,
            "code": code
        }

        const responseFromLark = await axios.post("https://open.larksuite.com/open-apis/authen/v2/oauth/token", payload);

        const userInfo = await axios.get("https://passport.larksuite.com/suite/passport/oauth/userinfo", {
            headers: {
                Authorization: `Bearer ${responseFromLark.data.access_token}`
            }
        });

        return NextResponse.json(userInfo.data, { status: userInfo.status });
    } catch (error: unknown) {
        return handleError(error)
    }
}
