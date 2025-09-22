import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';

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
        const token = await getTenantAccessToken();

        if(body.challenge){
            const nextResponse = NextResponse.json({
                challenge: body.challenge
            }, { status: 200 });
            return nextResponse;
        }

        const responseTaskDetail = await axios.get(`https://open.larksuite.com/open-apis/task/v2/tasks/${body.event.task_id}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })

        const { task } = responseTaskDetail.data.data;

        const findAppId = await axios.post(`https://open.larksuite.com/open-apis/bitable/v1/apps/IHQyb5FOeaIHm3scWdnlqd2DgEu/tables/tblrHYUQHZ0r72ja/records/search`,
            {
                filter: {
                    conjunction: "and",
                    conditions: [
                        {
                            field_name: "Task ID",
                            operator: "is",
                            value: [body.event.task_id]
                        }
                    ],
                }
            }
            , {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })


        if (Array.isArray(findAppId.data.data.items) && findAppId.data.data.items.length > 0) {
            const firstItem = findAppId.data.data.items[0];

            const appId = firstItem?.fields?.['App ID']?.[0]?.text;
            const tableId = firstItem?.fields?.['Table ID']?.[0]?.text;
            const recordId = firstItem?.fields?.['Record Id']?.[0]?.text;

            if (!appId || !tableId) {
                console.error('Missing required fields. Available fields:', Object.keys(firstItem?.fields || {}));
            }

            await axios.put(`https://open.larksuite.com/open-apis/bitable/v1/apps/${appId}/tables/${tableId}/records/${recordId}`,
                {
                    fields: { "Status": task.status }
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            )
        } else {
            console.log('No items found in response or items is not an array');
            console.log('Items:', findAppId.data.data.items);
        }

        const nextResponse = NextResponse.json({
            challenge: body.challenge
        }, { status: 200 });
        return nextResponse;
    } catch (e) {
        return handleError(e);
    }
}