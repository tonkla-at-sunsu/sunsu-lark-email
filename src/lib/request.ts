import axios, { AxiosInstance } from "axios";
import { ErrorResponse, GetDowloadAttachmentFilesResponse, GetEmailDetailResponse, GetEmailListResponse, GetUserInfoResponse } from "@/types/request";
import { getItem } from "./storage";

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
            setAlert("error", (error.response.data as { msg?: string }).msg || "Error", () => {
                window.location.href = "/login"
            }, false);
            return {
                code: error.response.status || 400,
                msg: (error.response.data as { msg?: string }).msg || "Error",
                error: true,
            };
        } else {
            setAlert("error", error.message, () => {
                window.location.href = "/login"
            }, false);
            return {
                code: 9999,
                msg: error.message,
                error: true,
            };
        }
    } else {
        setAlert("An unknown error occurred. Try again!", "error", () => {
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
    private readonly client: AxiosInstance;
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
        this.client = axios.create({
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${getItem("access_token")}`,
            },
        });
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
        try {
            let query = ""
            if (pageToken !== "") {
                query = `&page_token=${pageToken}`
            }
            const response = await axios.get(`/api/email/list?email=${encodeURIComponent(email)}&page_size=${pageSize}&folder_id=${encodeURIComponent(folderId)}${query}`)
            return response.data
        } catch (e) {
            return handlerError(e, this.setAlert)
        }
    }

    getEmailDetail = async (email: string, messageId: string): Promise<GetEmailDetailResponse | ErrorResponse> => {
        try {
            const cacheKey = `email_detail:${email}:${messageId}`
            if (typeof window !== "undefined") {
                const cached = window.localStorage.getItem(cacheKey)
                if (cached) {
                    return JSON.parse(cached) as GetEmailDetailResponse
                }
            }

            const response = await axios.get(`/api/email/detail?email=${encodeURIComponent(email)}&message_id=${messageId}`)
            if (typeof window !== "undefined") {
                window.localStorage.setItem(cacheKey, JSON.stringify(response.data))
            }
            return response.data
        } catch (e) {
            return handlerError(e, this.setAlert)
        }
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
}
