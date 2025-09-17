import axios from "axios";
import { ErrorResponse, GetEmailDetailResponse, GetEmailListFolder, GetEmailListResponse, GetUserInfoResponse } from "@/types/request";
import { idbGetItem, idbSetItem } from "@/lib/storage";

const handlerError = (
    error: unknown,
    setAlert: (
        message: string,
        type: string,
        action: (() => void) | undefined,
        isOpen: boolean,
    ) => void,
): ErrorResponse => {
    if (axios.isAxiosError(error)) {
        if (
            error.response &&
            error.response.data &&
            (error.response.data as { error?: unknown }).error
        ) {
            const responseData = error.response.data as { code?: number; msg?: string };
            if (responseData.code === 99991400) {
                return {
                    code: 99991400,
                    msg: "Rate limit exceeded, retrying...",
                    error: true,
                };
            }
            setAlert("เกิดข้อผิดพลาด", responseData.msg || "Error", () => {
                window.location.href = "/login"
            }, false);
            return {
                code: error.response.status || 400,
                msg: responseData.msg || "Error",
                error: true,
            };
        } else {
            setAlert("เกิดข้อผิดพลาด", error.message, () => {
                window.location.href = "/login"
            }, false);
            return {
                code: 9999,
                msg: error.message,
                error: true,
            };
        }
    } else {
        console.error(error)
        setAlert("เกิดข้อผิดพลาด", "An unknown error occurred. Try again!", () => {
            window.location.href = "/"
        }, false);
        return {
            code: 9999,
            msg: "An unknow error occurred. try again!",
            error: true,
        };
    }
};

export class BackendClient {
    private readonly setAlert: (
        message: string,
        type: string,
        action: (() => void) | undefined,
        isOpen: boolean,
    ) => void;

    constructor(
        setAlert: (
            message: string,
            type: string,
            action: (() => void) | undefined,
            isOpen: boolean,
        ) => void,
    ) {
        this.setAlert = setAlert;
    }

    private async retryWithDelay<T>(
        requestFn: () => Promise<T>,
        maxRetries: number = 3
    ): Promise<T> {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                const errorResponse = handlerError(error, this.setAlert);
                if (errorResponse.code === 99991400 && attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                throw errorResponse;
            }
        }
        throw { code: 9999, msg: "Max retries exceeded", error: true };
    }

    getAccessToken = async (code: string): Promise<GetUserInfoResponse | ErrorResponse> => {
        try {
            const response = await axios.get(`/api/authorization?code=${code}`)
            return response.data
        } catch (e) {
            return handlerError(e, this.setAlert)
        }
    }

    getEmailList = async (email: string, pageSize: number, folderId: string, pageToken = ""): Promise<GetEmailListResponse | ErrorResponse> => {
        return this.retryWithDelay(async () => {
            let query = ""
            if (pageToken !== "") {
                query = `&page_token=${pageToken}`
            }
            const response = await axios.get(`/api/email/list?email=${encodeURIComponent(email)}&page_size=${pageSize}&folder_id=${encodeURIComponent(folderId)}${query}`)
            return response.data
        });
    }

    getEmailDetail = async (email: string, messageId: string): Promise<GetEmailDetailResponse | ErrorResponse> => {
        const cacheKey = `email_detail:${email}:${messageId}`
        const cached = await idbGetItem(cacheKey)
        if (cached) {
            try {
                return JSON.parse(cached) as GetEmailDetailResponse
            } catch (err) {
                console.error(err);
            }
        }

        return this.retryWithDelay(async () => {
            const response = await axios.get(`/api/email/detail?email=${encodeURIComponent(email)}&message_id=${messageId}`)
            await idbSetItem(cacheKey, JSON.stringify(response.data))
            return response.data
        });
    }

    getDowloadAttachmentFiles = async (email: string, messageId: string, attachmentIds: string[]): Promise<void | ErrorResponse> => {
        try {
            let attachmentQuery = ""
            for (const attachmentId of attachmentIds) {
                attachmentQuery += `&attachment_ids=${attachmentId}`
            }
            window.open(`/api/email/attachment?email=${email}&message_id=${messageId}${attachmentQuery}`, "_blank")
        } catch (e) {
            return handlerError(e, this.setAlert)
        }
    }

    getEmailListFolder = async (email: string): Promise<GetEmailListFolder | ErrorResponse> => {
        try {
            const response = await axios.get(`/api/email/list-folder?email=${email}`)
            return response.data
        } catch (e) {
            return handlerError(e, this.setAlert)
        }
    }
}
