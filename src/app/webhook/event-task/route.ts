import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';
import { getSupabaseServiceClient } from "@/lib/database";

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
        const supabase = getSupabaseServiceClient();

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

        await axios.put(`https://open.larksuite.com/open-apis/bitable/v1/apps/${appId}/tables/${tableId}/records/${recordId}`,
            {
                fields: {
                    "Due Date": task.status === "todo" ? null : new Date().setHours(0, 0, 0, 0).valueOf().toString(),
                    "Status": statusKey
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )

        const nextResponse = NextResponse.json({
            challenge: body.challenge
        }, { status: 200 });
        return nextResponse;
    } catch (e) {
        return handleError(e);
    }
}