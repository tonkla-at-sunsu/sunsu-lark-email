import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';
import { getSupabaseServiceClient } from "@/lib/database";

interface Member {
    id: string;
    type: string;
    role: string;
}

interface WebhookRequest {
    table_id: string;
    base_id: string;
    record_id: string;
    title: string;
    description: string;
    start_time: string;
    end_time: string;
    owner: string;
    status: string;
    phase: string;
    create_by: string;
    update_by: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: WebhookRequest = await request.json();

        if(body.update_by == "IT Bot") {
            return NextResponse.json({}, { status: 200 });
        }

        const token = await getTenantAccessToken();
        const supabase = getSupabaseServiceClient();

        const { data } = await supabase.from('task-mapping')
            .select()
            .eq('table_id', body.table_id)
            .eq('base_id', body.base_id)
            .eq('record_id', body.record_id);

        const taskId = data?.[0].task_id;
        const responseTaskDetail = await axios.get(`https://open.larksuite.com/open-apis/task/v2/tasks/${taskId}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
        const { task } = responseTaskDetail.data.data;

        if (body.owner !== "") {
            if (Array.isArray(task.members)) {
                await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasks/${taskId}/remove_members?user_id_type=open_id`,
                    {
                        members: [
                            {
                                "id": task.members.filter((m: Member) => m.role == "assignee")[0].id,
                                "role": "assignee",
                                "type": "user"
                            }
                        ]
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                )
            }


            await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasks/${taskId}/add_members?user_id_type=union_id`,
                {
                    members: [
                        {
                            "id": body.owner,
                            "role": "assignee",
                            "type": "user"
                        }
                    ]
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            )
        }

        const completedAt = body.status.toLowerCase() === "completed" ? (new Date()).valueOf().toString() : "0"
        const response = await axios.patch(`https://open.larksuite.com/open-apis/task/v2/tasks/${taskId}?user_id_type=union_id`,
            {
                task: {
                    "summary": body.title !== "" ? body.title : " ",
                    "description": body.description !== "" ? body.description : " ",
                    "start": {
                        "timestamp": body.start_time !== "" ? body.start_time : new Date().valueOf(),
                        "is_all_day": true
                    },
                    "due": {
                        "timestamp": body.end_time !== "" ? body.end_time : new Date().valueOf(),
                        "is_all_day": true
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