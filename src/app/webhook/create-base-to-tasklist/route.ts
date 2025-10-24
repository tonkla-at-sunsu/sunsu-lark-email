/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';
import { getSupabaseServiceClient } from "@/lib/database";
import { addMemberToTaskList, createCustomFieldToTaskList, createSection, createTask, createTaskList, getTableInfo } from "@/lib/lark-helper";
import { Member } from "@/types/lark";

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
}

export async function POST(request: NextRequest) {
    try {
        const body: WebhookRequest = await request.json();
        const token = await getTenantAccessToken();
        const supabase = getSupabaseServiceClient();

        const tableInfo = await getTableInfo(token, body.base_id);
        let taskListName = "empty";
        if (Array.isArray(tableInfo?.items) && tableInfo?.items.length > 0) {
            const foundItem = tableInfo?.items.find((i: any) => i.table_id === body.table_id);
            taskListName = foundItem?.name || "empty";
        }

        let taskListId = ""
        let sectionId = ""
        let customFieldId = ""
        let optionMapping: Record<string, string> = {
            "Not yet started": "",
            "Ongoing": "",
            "Completed": "",
            "Stalled": ""
        }

        const { data, error: queryError } = await supabase.from('tasklist-mapping')
            .select()
            .eq('table_id', body.table_id)
            .eq('base_id', body.base_id)

        console.log('Query result:', {
            table_id: body.table_id,
            base_id: body.base_id,
            data,
            dataLength: data?.length,
            queryError
        });

        if (queryError) {
            console.error('Database query error:', queryError);
            throw new Error(`Database query failed: ${queryError.message}`);
        }

        if (data && data.length > 0) {
            console.log('Found existing mapping:', data[0]);

            // Check if the existing mapping is still a placeholder
            if (data[0].tasklist_id === "PLACEHOLDER") {
                console.log('Found placeholder mapping, waiting for it to be updated...');
                // Wait a bit and retry
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Retry the query
                const { data: retryData } = await supabase.from('tasklist-mapping')
                    .select()
                    .eq('table_id', body.table_id)
                    .eq('base_id', body.base_id);

                if (retryData && retryData.length > 0 && retryData[0].tasklist_id !== "PLACEHOLDER") {
                    console.log('Found updated mapping after retry:', retryData[0]);
                    taskListId = retryData[0].tasklist_id;
                    customFieldId = retryData[0].custom_field_id;
                    optionMapping = {
                        "Not yet started": retryData[0].not_started_id,
                        "Ongoing": retryData[0].on_going_id,
                        "Completed": retryData[0].completed_id,
                        "Stalled": retryData[0].stalled_id,
                    };
                } else {
                    console.log('Still placeholder after retry, treating as no mapping found');
                    // Treat as no mapping found and create new one
                }
            } else {
                taskListId = data[0].tasklist_id;
                customFieldId = data[0].custom_field_id;
                optionMapping = {
                    "Not yet started": data[0].not_started_id,
                    "Ongoing": data[0].on_going_id,
                    "Completed": data[0].completed_id,
                    "Stalled": data[0].stalled_id,
                };
            }
        } else {
            console.log('No existing mapping found, attempting to create new tasklist...');

            let insertSuccess = false;
            let retryCount = 0;
            const maxRetries = 5;

            while (!insertSuccess && retryCount < maxRetries) {
                try {
                    // First, try to insert a placeholder record to claim the mapping
                    const { error: claimErr } = await supabase
                        .from("tasklist-mapping")
                        .insert(
                            {
                                table_id: body.table_id,
                                base_id: body.base_id,
                                tasklist_id: "PLACEHOLDER", // Temporary placeholder
                                tasklist_name: taskListName,
                                section_id: "PLACEHOLDER",
                                section_name: body.phase,
                                custom_field_id: "PLACEHOLDER",
                                not_started_id: "PLACEHOLDER",
                                on_going_id: "PLACEHOLDER",
                                completed_id: "PLACEHOLDER",
                                stalled_id: "PLACEHOLDER",
                            }
                        );

                    if (claimErr) {
                        console.error('Failed to claim mapping:', claimErr);
                        if (claimErr.code === '23505' || claimErr.message.includes('duplicate')) {
                            console.log('Mapping already claimed by another request, fetching existing record...');
                            // Another request already created the mapping, fetch it
                            const { data: existingData } = await supabase.from('tasklist-mapping')
                                .select()
                                .eq('table_id', body.table_id)
                                .eq('base_id', body.base_id);

                            if (existingData && existingData.length > 0) {
                                console.log('Using existing mapping:', existingData[0]);
                                taskListId = existingData[0].tasklist_id;
                                customFieldId = existingData[0].custom_field_id;
                                optionMapping = {
                                    "Not yet started": existingData[0].not_started_id,
                                    "Ongoing": existingData[0].on_going_id,
                                    "Completed": existingData[0].completed_id,
                                    "Stalled": existingData[0].stalled_id,
                                };
                                insertSuccess = true;
                                break;
                            }
                        }
                        throw new Error(`Failed to claim tasklist mapping: ${claimErr.message}`);
                    }

                    // Successfully claimed the mapping, now create the actual resources
                    console.log('Successfully claimed mapping, creating tasklist resources...');

                    const membersRequest: Member[] = [{
                        "id": body.create_by,
                        "role": "viewer",
                        "type": "user"
                    }]

                    if (body.create_by !== body.owner) {
                        membersRequest.push({
                            "id": body.owner,
                            "role": "editor",
                            "type": "user"
                        })
                    }

                    console.log('Creating tasklist with name:', taskListName);
                    const createdTaskList = await createTaskList(token, {
                        "members": membersRequest,
                        "name": taskListName
                    }, "union_id");
                    console.log('Created tasklist:', createdTaskList);

                    const { guid } = createdTaskList;
                    const sectionName = body.phase;

                    const customField = await createCustomFieldToTaskList(token, guid);
                    const sectionInfo = await createSection(token, {
                        "name": sectionName,
                        "resource_type": "tasklist",
                        "resource_id": createdTaskList.guid,
                    })

                    sectionId = sectionInfo.guid;

                    // Update the placeholder record with actual values
                    const { error: updateErr } = await supabase
                        .from("tasklist-mapping")
                        .update({
                            tasklist_id: guid,
                            section_id: sectionId,
                            custom_field_id: customField.guid,
                            not_started_id: customField.not_started_id,
                            on_going_id: customField.on_going_id,
                            completed_id: customField.completed_id,
                            stalled_id: customField.stalled_id,
                        })
                        .eq('table_id', body.table_id)
                        .eq('base_id', body.base_id);

                    if (updateErr) {
                        console.error('Failed to update mapping with actual values:', updateErr);
                        // Clean up the placeholder record if update fails
                        await supabase
                            .from("tasklist-mapping")
                            .delete()
                            .eq('table_id', body.table_id)
                            .eq('base_id', body.base_id);
                        throw new Error(`Failed to update tasklist mapping: ${updateErr.message}`);
                    }

                    console.log('Successfully updated mapping with actual values');

                    customFieldId = customField.guid;
                    optionMapping = {
                        "Not yet started": customField.not_started_id,
                        "Ongoing": customField.on_going_id,
                        "Completed": customField.completed_id,
                        "Stalled": customField.stalled_id
                    };
                    taskListId = guid;
                    insertSuccess = true;
                } catch (error) {
                    console.error('Error creating tasklist mapping:', error);
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, 100 * retryCount)); // Exponential backoff
                }
            }
        }

        // Handle section creation for existing tasklist
        if (taskListId) {
            const { data: latestData } = await supabase.from('tasklist-mapping')
                .select()
                .eq('table_id', body.table_id)
                .eq('base_id', body.base_id)

            if (latestData && latestData.length > 0) {
                const filteredSection = latestData.filter((i: any) => i.section_name === body.phase);
                if (Array.isArray(filteredSection) && filteredSection.length > 0) {
                    sectionId = filteredSection[0].section_id;
                } else {
                    const sectionInfo = await createSection(token, {
                        "name": body.phase,
                        "resource_type": "tasklist",
                        "resource_id": taskListId
                    })
                    sectionId = sectionInfo.guid;

                    const { error: insertErr } = await supabase
                        .from("tasklist-mapping")
                        .insert(
                            {
                                table_id: body.table_id,
                                base_id: body.base_id,
                                tasklist_id: taskListId,
                                tasklist_name: taskListName,
                                section_id: sectionId,
                                section_name: body.phase,
                                custom_field_id: latestData[0].custom_field_id,
                                not_started_id: latestData[0].not_started_id,
                                on_going_id: latestData[0].on_going_id,
                                completed_id: latestData[0].completed_id,
                                stalled_id: latestData[0].stalled_id,
                            }
                        );
                    if (insertErr) {
                        console.error('Supabase insert error:', insertErr);
                        throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
                    }
                }
            }
        }

        if (!taskListId || taskListId === "PLACEHOLDER") {
            console.error('Invalid tasklist ID:', taskListId);
            throw new Error('Tasklist ID is invalid or still placeholder');
        }

        if (!customFieldId || customFieldId === "PLACEHOLDER") {
            console.error('Invalid custom field ID:', customFieldId);
            throw new Error('Custom field ID is invalid or still placeholder');
        }

        const { data: existingTask } = await supabase.from('task-mapping')
            .select()
            .eq('table_id', body.table_id)
            .eq('base_id', body.base_id)
            .eq('record_id', body.record_id);

        if (existingTask && existingTask.length > 0) {
            console.log('Task already exists for this record:', existingTask[0]);
            return NextResponse.json({
                message: 'Task already exists for this record',
                task_id: existingTask[0].task_id
            }, { status: 200 });
        }

        const status = body.status === "" ? "Not yet started" : body.status;
        const statusId = optionMapping[status];

        console.log('Creating task with:', {
            taskListId,
            sectionId,
            customFieldId,
            status,
            statusId,
            optionMapping
        });

        let createdTask;
        try {
            createdTask = await createTask(token, {
                "summary": body.title !== "" ? body.title : " ",
                "description": body.description !== "" ? body.description : " ",
                "start": {
                    "timestamp": body.start_time !== "" ? body.start_time : new Date().setHours(0, 0, 0, 0).valueOf().toString(),
                    "is_all_day": false
                },
                "due": {
                    "timestamp": body.end_time !== "" ? body.end_time :
                        body.start_time ? body.start_time : new Date().setHours(23, 59, 0, 0).valueOf().toString(),
                    "is_all_day": false
                },
                completed_at: "0",
                "custom_fields": [{
                    "guid": customFieldId,
                    "single_select_value": statusId
                }],
                "members": [
                    {
                        "id": body.owner,
                        "role": "assignee",
                        "type": "user"
                    },
                    {
                        "id": body.create_by,
                        "role": "follower",
                        "type": "user"
                    }
                ],
                "tasklists": [
                    {
                        "tasklist_guid": taskListId,
                        "section_guid": sectionId
                    }
                ],
            });
            console.log('Successfully created task:', createdTask);
        } catch (taskError) {
            console.error('Failed to create task:', taskError);
            const errorMessage = taskError instanceof Error ? taskError.message : String(taskError);
            throw new Error(`Failed to create task: ${errorMessage}`);
        }

        console.log('Inserting task mapping:', {
            table_id: body.table_id,
            base_id: body.base_id,
            record_id: body.record_id,
            task_id: createdTask.guid ?? "",
        });

        const { error: insertErr } = await supabase
            .from("task-mapping")
            .insert(
                {
                    table_id: body.table_id,
                    base_id: body.base_id,
                    record_id: body.record_id,
                    task_id: createdTask.guid ?? "",
                }
            );

        if (insertErr) {
            console.error('Supabase insert error:', insertErr);
            throw new Error(`Failed to insert task mapping: ${insertErr.message}`);
        }

        if (body.owner !== "") {
            await addMemberToTaskList(token, taskListId, [
                {
                    "id": body.owner,
                    "role": "viewer",
                    "type": "user"
                }
            ])
        }

        const nextResponse = NextResponse.json({}, { status: 200 });
        return nextResponse;
    } catch (e) {
        return handleError(e);
    }
}