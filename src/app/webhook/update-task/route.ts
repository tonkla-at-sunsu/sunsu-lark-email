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
    task_id: string;
}

interface UpdateTaskRequest {
    header: HeaderTask;
    data: DataTask;
}

export async function POST(request: NextRequest) {
    try {
        const body: UpdateTaskRequest = await request.json();
        const token = await getTenantAccessToken();

        if(body.header.edit_by == "Automate Task") {
            return NextResponse.json({}, { status: 200 });
        }

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

        const responseTaskDetail = await axios.get(`https://open.larksuite.com/open-apis/task/v2/tasks/${body.header.task_id}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })

        const { task } = responseTaskDetail.data.data;

        if (body.data.members[0]?.id !== "") {

            if (Array.isArray(task.members)) {
                await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasks/${body.header.task_id}/remove_members?user_id_type=open_id`,
                    {
                        members: task.members
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                )
            }


            await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasks/${body.header.task_id}/add_members?user_id_type=union_id`,
                {
                    members: body.data.members
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            )
        }

        const response = await axios.patch(`https://open.larksuite.com/open-apis/task/v2/tasks/${body.header.task_id}?user_id_type=union_id`,
            {
                task: {
                    summary: body.data.summary,
                    description: body.data.description,
                    start: {
                        timestamp: body.data.start.timestamp,
                        is_all_day: body.data.start.is_all_day
                    },
                    due: {
                        timestamp: body.data.due.timestamp,
                        is_all_day: body.data.due.is_all_day
                    },
                    completed_at: completedAt
                },
                update_fields: ["summary", "description", "start", "due", "completed_at"]
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )

        const nextResponse = NextResponse.json(response.data, { status: response.status });
        return nextResponse;
    } catch (e) {
        return handleError(e);
    }
}