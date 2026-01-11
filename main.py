from todoist_api_python.api import TodoistAPI
import datetime as dt
import os

schedule_blocked = set()

def is_time_block(datetime: dt.datetime):
    if datetime in schedule_blocked:
        return True
    if datetime.hour > 21 or datetime.hour < 8:
        return True
    return False

def to_datetime(d):
    return dt.datetime.combine(d, dt.time()) if isinstance(d, dt.date) and not isinstance(d, dt.datetime) else d.replace(hour=0, minute=0, second=0, microsecond=0)

def main():
    api = TodoistAPI(os.getenv("TODOIST_KEY"))
    tasks = list(api.get_tasks())[0]
    unscheduled_tasks = [task for task in tasks if task.due is None]
    start_of_today = dt.datetime.combine(dt.date.today(), dt.time.min)
    
    bad_tasks = [
        task
        for task in tasks
        if task.due is None or (to_datetime(task.due.date) < start_of_today and not task.due.is_recurring) or not isinstance(task.due.date, dt.datetime)
    ]
    now_rounded = (t := dt.datetime.now()).replace(minute=0, second=0, microsecond=0) + dt.timedelta(minutes=30 * ((t.minute + 29) // 30))

    for unscheduled_task in bad_tasks:
        time = now_rounded
        for i in range(10000):
            if not is_time_block(time):
                break
            time = time + dt.timedelta(minutes=30)
        if unscheduled_task and unscheduled_task.due and unscheduled_task.due.date in schedule_blocked:
            schedule_blocked.remove(unscheduled_task.due.date)
        api.update_task(unscheduled_task.id, due_datetime=time)
        schedule_blocked.add(time)


            
if __name__ == "__main__":
    main()
