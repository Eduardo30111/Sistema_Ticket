from collections import defaultdict
from datetime import timedelta

from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth.models import User
from django.shortcuts import render
from django.utils import timezone
from api.models import Ticket, AsignacionTarea


@staff_member_required
def estadisticas_admin(request):
    """Vista de estadísticas en el panel de administración de Django."""
    from api.models import Ticket, AsignacionTarea

    now = timezone.now()
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)

    pending = Ticket.objects.filter(estado='ABIERTO').count()
    in_process = Ticket.objects.filter(estado='EN_PROCESO').count()
    closed = Ticket.objects.filter(estado='CERRADO').count()
    total = Ticket.objects.count()
    technicians = [
        user.get_full_name() or user.username
        for user in User.objects.filter(is_active=True, is_staff=False, is_superuser=False).order_by('username')
    ]

    completed_tasks = (
        Ticket.objects.filter(
            estado='CERRADO',
            atendido_por__isnull=False,
        )
        .exclude(atendido_por__exact='')
        .order_by('-fecha')
    )

    total_by_technician = defaultdict(int)
    daily_totals = defaultdict(int)
    weekly_stats = defaultdict(lambda: {'completed': 0, 'hours': []})
    monthly_stats = defaultdict(lambda: {'completed': 0, 'hours': []})

    for ticket in completed_tasks:
        tech_name = ticket.atendido_por
        created_at = ticket.fecha

        total_by_technician[tech_name] += 1

        resolution_hours = max(
            (now - created_at).total_seconds() / 3600,
            0,
        ) if created_at else 0

        if created_at >= month_start:
            day_key = created_at.date().isoformat()
            daily_totals[day_key] += 1

        if created_at >= week_start:
            weekly_stats[tech_name]['completed'] += 1
            weekly_stats[tech_name]['hours'].append(resolution_hours)

        if created_at >= month_start:
            monthly_stats[tech_name]['completed'] += 1
            monthly_stats[tech_name]['hours'].append(resolution_hours)

    def build_table(stats_map):
        rows = []
        for name in technicians:
            info = stats_map.get(name, {'completed': 0, 'hours': []})
            count = info['completed']
            avg_hours = sum(info['hours']) / len(info['hours']) if info['hours'] else 0
            score = 0 if count == 0 else count if avg_hours == 0 else round(count / avg_hours, 2)
            rows.append({
                'technician': name,
                'completedRepairs': count,
                'averageResolutionHours': round(avg_hours, 2),
                'efficiencyScore': score,
            })
        rows.sort(key=lambda r: (-r['completedRepairs'], r['averageResolutionHours']))
        for i, row in enumerate(rows, 1):
            row['rank'] = i
        return rows

    top_worker = None
    if total_by_technician:
        name, count = max(total_by_technician.items(), key=lambda p: p[1])
        top_worker = {'name': name, 'totalRepairs': count}

    repairs_per_day = [
        {'date': day, 'totalRepairs': daily_totals[day]}
        for day in sorted(daily_totals)[-7:]
    ]
    repairs_per_day.reverse()

    context = {
        **_admin_context(request),
        'title': 'Estadísticas — Oficina TIC',
        'pending': pending,
        'in_process': in_process,
        'closed': closed,
        'total': total,
        'top_worker': top_worker,
        'repairs_per_day': repairs_per_day,
        'weekly_efficiency': build_table(weekly_stats),
        'monthly_efficiency': build_table(monthly_stats),
        'generated_at': now,
    }
    return render(request, 'admin/estadisticas_panel.html', context)


def _admin_context(request):
    """Contexto mínimo para que el template `admin/base_site.html` funcione."""
    from django.contrib.admin import site as admin_site
    return admin_site.each_context(request)


@staff_member_required
def ticket_chat_admin(request):
    users = User.objects.filter(is_active=True).exclude(id=request.user.id).order_by('first_name', 'last_name', 'username')

    context = {
        **_admin_context(request),
        'title': 'Chat Interno',
        'users': users,
    }
    return render(request, 'admin/ticket_chat.html', context)
