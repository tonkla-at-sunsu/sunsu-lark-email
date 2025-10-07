/* eslint-disable @typescript-eslint/no-explicit-any */
import { CreateSectionRequest, CreateTaskListRequest, CreateTaskPayload, Member, SectionInfo, TableInfo, TaskInfo, TaskListInfo, UpdateTaskPayload } from "@/types/lark";
import axios from "axios"

export const getTableInfo = async (token: string, baseId: string): Promise<TableInfo> => {
    const { data } = await axios.get(`https://open.larksuite.com/open-apis/bitable/v1/apps/${baseId}/tables`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })

    return data.data;
}

export const createTaskList = async (token: string, payload: CreateTaskListRequest, user_id_type: string = "union_id"): Promise<TaskListInfo> => {
    const { data } = await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasklists?user_id_type=${user_id_type}`, payload, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })

    return data.data.tasklist;
}

export const createSection = async (token: string, payload: CreateSectionRequest): Promise<SectionInfo> => {
    const { data } = await axios.post("https://open.larksuite.com/open-apis/task/v2/sections", payload, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })

    return data.data.section;
}

export const createTask = async (token: string, payload: CreateTaskPayload, userIdType: string = "union_id"): Promise<TaskInfo> => {
    const { data } = await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasks?user_id_type=${userIdType}`, {
        ...payload,
        "reminders": [
            {
                "relative_fire_minute": 60 * 33
            }
        ]
    }
        , {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })

    return data.data.task
}

export const updateTask = async (token: string, taskId: string, payload: UpdateTaskPayload, updateFields: string[], userIdType: string = "union_id"): Promise<TaskInfo> => {
    const { data } = await axios.patch(`https://open.larksuite.com/open-apis/task/v2/tasks/${taskId}?user_id_type=${userIdType}`,
        {
            task: payload,
            update_fields: updateFields
        },
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    )

    return data.data.task
}

export const addMemberToTaskList = async (token: string, taskListId: string, member: Member[], userIdType: string = "union_id"): Promise<TaskInfo> => {
    const { data } = await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasklists/${taskListId}/add_members?user_id_type=${userIdType}`, {
        members: member
    }, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })

    return data.data.task
}

export const addMemberToTask = async (token: string, taskId: string, member: Member[], userIdType: string = "union_id"): Promise<TaskInfo> => {
    const { data } = await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasks/${taskId}/add_members?user_id_type=${userIdType}`, {
        members: member
    }, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })

    return data.data.task
}

export const removeMemberToTask = async (token: string, taskId: string, member: Member[], userIdType: string = "open_id"): Promise<TaskInfo> => {
    const { data } = await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasks/${taskId}/remove_members?user_id_type=${userIdType}`, {
        members: member
    }, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })

    return data.data.task
}

export const getTaskInfo = async (token: string, taskId: string): Promise<TaskInfo> => {
    const { data } = await axios.get(`https://open.larksuite.com/open-apis/task/v2/tasks/${taskId}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })

    return data.data.task;
}

export const createCustomFieldToTaskList = async (token: string, taskListId: string) => {
    const { data } = await axios.post(`https://open.larksuite.com/open-apis/task/v2/custom_fields`, {
        "resource_type": "tasklist",
        "resource_id": taskListId,
        "name": "status",
        "type": "single_select",
        "single_select_setting": {
            "options": [
                {
                    "name": "Not yet started",
                    "color_index": 52,
                    "is_hidden": false
                },
                {
                    "name": "Ongoing",
                    "color_index": 11,
                    "is_hidden": false
                },
                {
                    "name": "Completed",
                    "color_index": 20,
                    "is_hidden": false
                },
                {
                    "name": "Stalled",
                    "color_index": 52,
                    "is_hidden": false
                }
            ]
        }
    }, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })

    return {
        "guid": data.data.custom_field.guid,
        "not_started_id": data.data.custom_field.single_select_setting.options.find((option: any) => option.name === "Not yet started").guid ?? "",
        "on_going_id": data.data.custom_field.single_select_setting.options.find((option: any) => option.name === "Ongoing").guid ?? "",
        "completed_id": data.data.custom_field.single_select_setting.options.find((option: any) => option.name === "Completed").guid ?? "",
        "stalled_id": data.data.custom_field.single_select_setting.options.find((option: any) => option.name === "Stalled").guid ?? "",
    }
}
