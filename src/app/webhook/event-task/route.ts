import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';
import { getSupabaseServiceClient } from "@/lib/database";
import { updateTask } from "@/lib/lark-helper";
import { SupabaseClient } from '@supabase/supabase-js';

interface Event {
    event_type: string;
    object_type: string;
    task_id: string;
}

interface Header {
    app_id: string;
    create_time: string;
    event_id: string;
    event_type: string;
    tanant_key: string;
}

interface WebhookRequest {
    event: Event;
    header: Header;
    schema: string;
    challenge: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: WebhookRequest = await request.json();

        if (body.challenge) {
            const nextResponse = NextResponse.json({
                challenge: body.challenge
            }, { status: 200 });
            return nextResponse;
        }

        const token = await getTenantAccessToken();
        const supabase: SupabaseClient = getSupabaseServiceClient();

        const responseTaskDetail = await axios.get(`https://open.larksuite.com/open-apis/task/v2/tasks/${body.event.task_id}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })

        const { task } = responseTaskDetail.data.data;
        const { data } = await supabase.from('task-mapping')
            .select()
            .eq('task_id', body.event.task_id)

        if (!data || data.length === 0) {
            console.error('No task mapping found for task_id:', body.event.task_id);
            return NextResponse.json({ error: 'Task mapping not found' }, { status: 404 });
        }

        const { base_id: appId, table_id: tableId, record_id: recordId } = data[0]
        const tasklistId = task.tasklists[0].tasklist_guid;
        const taskStatusId = task.custom_fields[0].single_select_value;

        const { data: recordDetail } = await axios.post(`https://open.larksuite.com/open-apis/bitable/v1/apps/${appId}/tables/${tableId}/records/batch_get`, {
            "record_ids": [
                recordId
            ],
            "user_id_type": "open_id",
            "automatic_fields": true
        },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })
        const recordStatus = recordDetail.data.records[0].fields.Status;

        const { data: tasklistMapping } = await supabase.from('tasklist-mapping')
            .select()
            .eq('table_id', tableId)
            .eq('base_id', appId)
            .eq('tasklist_id', tasklistId)

        const optionMapping = {
            "Not yet started": tasklistMapping?.[0].not_started_id,
            "Ongoing": tasklistMapping?.[0].on_going_id,
            "Completed": tasklistMapping?.[0].completed_id,
            "Stalled": tasklistMapping?.[0].stalled_id,
        }

        let statusKey = Object.keys(optionMapping).find(key => optionMapping[key as keyof typeof optionMapping] === taskStatusId);
        if (task.status !== "todo") {
            statusKey = "Completed"
        }

        if (!statusKey ||
            (recordStatus === "Completed" && task.status == "todo") ||
            (body.header.event_type === "task.task.comment.updated_v1" && recordStatus === "Not yet started")) {
            statusKey = "Ongoing";
        }

        await axios.put(`https://open.larksuite.com/open-apis/bitable/v1/apps/${appId}/tables/${tableId}/records/${recordId}`,
            {
                fields: {
                    "Process": task.summary,
                    "Start Date": typeof task.start === "undefined" ? null : Number(task.start.timestamp),
                    "Estimate Deadline": typeof task.due === "undefined" ? null : Number(task.due.timestamp),
                    "Remark": task.description,
                    "Due Date": task.status === "todo" ? null : new Date().valueOf(),
                    "Status": statusKey
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )

        await updateTask(token, body.event.task_id, {
            "custom_fields": [{
                "guid": tasklistMapping?.[0].custom_field_id,
                "single_select_value": optionMapping[statusKey as keyof typeof optionMapping]
            }]
        }, ["custom_fields"])

        const nextResponse = NextResponse.json({}, { status: 200 });
        return nextResponse;
    } catch (e) {
        return handleError(e);
    }
}