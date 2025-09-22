import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';

interface Member {
    id: string;
    type: string;
    role: string;
}


interface TimeRequest {
    timestamp: string;
    is_all_day: true;
}

interface DataTask {
    summary: string;
    description: string;
    status: string;
    start: TimeRequest;
    due: TimeRequest;
    members: Member[];
}

interface HeaderTask {
    base_id: string;
    table_id: string;
    edit_by: string;
    view_id: string;
}

interface CreateTaskRequest {
    header: HeaderTask;
    data: DataTask;
}

export async function POST(request: NextRequest) {
    try {
        const body: CreateTaskRequest = await request.json();
        const token = await getTenantAccessToken();

        if (body.data.start.timestamp == "") {
            body.data.start.timestamp = (new Date()).valueOf().toString()
        }

        if (body.data.due.timestamp == "") {
            body.data.due.timestamp = (new Date()).valueOf().toString()
        }

        if (body.data.summary == "") {
            body.data.summary = " "
        }

        if (body.data.description == "") {
            body.data.description = " "
        }

        const completedAt = body.data.status.toLowerCase() === "done" ? (new Date()).valueOf().toString() : "0"

        const response = await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasks?user_id_type=union_id`,
            {
                ...body.data,
                completed_at: completedAt
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )

        await axios.post("https://tfe9abw40bz.sg.larksuite.com/base/workflow/webhook/event/JWwXapOAsw6RB3hirgIlYmDmgWc", {
            ...body.header,
            task_id: response.data.data.task.guid ?? ""
        })

        const nextResponse = NextResponse.json(response.data, { status: response.status });
        return nextResponse;
    } catch (e) {
        return handleError(e);
    }
}