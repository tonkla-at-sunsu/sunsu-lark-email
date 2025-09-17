import axios from "axios"
import { NextResponse } from "next/server"

export const getTenantAccessToken = async () => {
    const response = await axios.post("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
        "app_id": process.env.NEXT_PUBLIC_APP_ID,
        "app_secret": process.env.APP_SECRET
    })

    return response.data.tenant_access_token
}

export const handleError = (error: unknown) => {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 500;
        const data = error.response?.data ?? { message: error.message };
        return NextResponse.json({ code: 9999, msg: data?.error_description || "some thing went wrong" }, { status });
    }

    return NextResponse.json({ code: 9999, msg: "some thing went wrong" }, { status: 400 });
}

export const BackendError = (message: string) => {
    return NextResponse.json({ code: 9999, msg: message }, { status: 400 });
}