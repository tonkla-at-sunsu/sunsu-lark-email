
export interface TableInfo {
    has_more: boolean;
    page_token: string;
    total: number;
    items: TableInfoItem[];
}

export interface TableInfoItem {
    table_id: string;
    revision: number;
    name: string;
}

export interface Member {
    id: string;
    type: "user" | "chat" | "app";
    role: "editor" | "viewer" | "assignee" | "follower";
}

export interface CreateTaskListRequest {
    name: string;
    members: Member[]
}

export interface TaskListInfo {
    guid: string;
    name: string;
    url: string;
    creator: Member;
    owner: Member;
    members: Member[];
    created_at: string;
    updated_at: string;
}

export interface CreateSectionRequest {
    name: string;
    resource_type: "tasklist" | "my_tasks";
    resource_id: string;
    insert_before?: string;
    insert_after?: string;
}

export interface SectionInfoTasklist {
    guid: string;
    name: string;
}

export interface SectionInfo {
    guid: string;
    name: string;
    resource_type: string;
    is_default: boolean;
    creator: Member;
    tasklist: SectionInfoTasklist;
    created_at: string;
    updated_at: string;
}

export interface Timestamp {
    timestamp: string;
    is_all_day: boolean;
}

export interface CreateTaskCustomFields {
    guid: string;
    single_select_value: string;
}

export interface CreateTaskPayload {
    summary: string;
    completed_at?: string;
    description: string;
    members: Member[];
    start: Timestamp
    due: Timestamp;
    tasklists: TaskInfoTasklist[];
    custom_fields: CreateTaskCustomFields[];
}

export interface UpdateTaskPayload {
    summary?: string;
    description?: string;
    start?: Timestamp
    due?: Timestamp;
    completed_at?: string;
    custom_fields: CreateTaskCustomFields[];
}


export interface TaskInfoTasklist {
    tasklist_guid: string;
    section_guid: string;
}

export interface TaskInfoCustomFields {
    guid: string;
    type: string;
    number_value: string;
    datetime_value: string;
    single_select_value: string;
    name: string;
    text_value: string;
    multi_select_value: string[];
    member_value: Member[];
}

export interface TaskInfo {
    guid: string;
    summary: string;
    description: string;
    due: Timestamp;
    creator: Member;
    members: Member[];
    completed_at: string;
    tasklists: TaskInfoTasklist[];
    created_at: string;
    updated_at: string;
    status: string;
    url: string;
    start: Timestamp;
    custom_fields: TaskInfoCustomFields[];
}   
