
export interface ErrorResponse {
    code: number,
    msg: string,
    error: true,
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isErrorResponse = (data: any): data is ErrorResponse => {
    return typeof data === "object" && data !== null && (data as { error?: unknown }).error === true;
};

export interface GetUserInfoResponse {
    sub: string;
    name: string;
    picture: string;
    open_id: string;
    en_name: string;
    tenant_key: string;
    avatar_url: string;
    avatar_thumb: string;
    avatar_middle: string;
    avatar_big: string;
    email: string;
    user_id: string;
    employee_no: string;
    mobile: string;
}

export const getInitUserInfo = (): GetUserInfoResponse => {
    return {
        sub: "",
        name: "",
        picture: "",
        open_id: "",
        en_name: "",
        tenant_key: "",
        avatar_url: "",
        avatar_thumb: "",
        avatar_middle: "",
        avatar_big: "",
        email: "",
        user_id: "",
        employee_no: "",
        mobile: ""
    }
}

export interface GetEmailListResponse {
    code: number;
    msg: string;
    data: EmailPagination;
}

export interface EmailPagination {
    has_more: boolean;
    items: string[];
    page_token: string;
}

export interface GetEmailDetailResponse {
    code: number;
    msg: string;
}

export interface GetEmailDetailResponse {
    code: number;
    msg: string;
    data: EmailMessage;
}

export interface EmailMessage {
    message: EmailDetail;
}

export interface EmailDetail {
    body_html: string;
    body_plain_text: string;
    internal_date: string;
    message_id: string;
    message_state: number;
    smtp_message_id: string;
    subject: string;
    thread_id: string;
    to: MailAddress[];
    head_from: MailAddress;
    cc: MailAddress;
    attachments: Attachment[]
}

export interface Attachment {
    cid: string;
    filename: string;
    id: string;
    is_inline: boolean;
}

export interface MailAddress {
    mail_address: string;
    name: string;
}

export interface GetDowloadAttachmentFilesResponse {
    code: number;
    msg: string;
    data: DataAttachment;
}

export interface DataAttachment {
    download_urls: AttachmentUrl[];
    failed_ids: string[];
}

export interface AttachmentUrl {
    attachment_id: string;
    download_url: string;
}