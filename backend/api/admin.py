from django import forms
from django.contrib import admin
from django.contrib import messages
from django.db.models import Q
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group, Permission, User
from django.http import JsonResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html
import secrets
import string
from .models import (
    AsignacionTarea,
    Equipo,
    Oficina,
    Persona,
    OficinaEquipo,
    SolicitudReactivacionContratista,
    Ticket,
    MascotaFeedback,
)
from .notifications import (
    is_valid_notification_email,
    notify_admin_created_persona,
    notify_admin_created_user,
    notify_contractor_expired,
    notify_contractor_renewed_to_admin,
)
from .utils import enviar_correo_ticket


USER_FIELD_LABELS = {
    'username': 'nombre de usuario',
    'email': 'correo electrónico',
    'first_name': 'nombre',
    'last_name': 'apellidos',
    'rol': 'rol',
    'is_active': 'estado de la cuenta',
}

PERSONA_FIELD_LABELS = {
    'nombre': 'nombre',
    'identificacion': 'número de documento',
    'tipo': 'tipo de persona',
    'oficina': 'oficina',
    'correo': 'correo electrónico',
    'telefono': 'teléfono',
    'fecha_inicio': 'fecha de inicio',
    'fecha_fin': 'fecha de terminación',
    'activo': 'estado',
}


def _send_profile_update_email(email_to: str, subject: str, recipient_name: str, updates: list[str]) -> None:
    if not is_valid_notification_email(email_to) or not updates:
        return
    intro_name = (recipient_name or '').strip() or 'usuario'
    updates_block = '\n'.join(f'- {item}' for item in updates)
    message = (
        f'Hola {intro_name},\n\n'
        f'Se realizaron cambios en tu información del Sistema TIC:\n\n'
        f'{updates_block}\n\n'
        f'Si no reconoces esta actualización, contacta a administración.'
    )
    enviar_correo_ticket(subject, message, [email_to.strip()])


class CustomUserForm(forms.ModelForm):
    """Formulario personalizado que usa un campo 'Rol' en lugar de checkboxes de staff/superuser."""
    ROL_CHOICES = [
        ('tecnico', '👨‍💻 Técnico — Acceso solo al Portal (Mis Tareas)'),
        ('supervisor', '🧭 Supervisor — Acceso al panel por módulos'),
        ('administrador', '👤 Administrador — Acceso total al panel'),
    ]
    MODULO_CHOICES = [
        ('oficina', 'Oficina'),
        ('inventario', 'Inventario'),
        ('observaciones', 'Observaciones'),
    ]

    rol = forms.ChoiceField(
        choices=ROL_CHOICES,
        label='Rol',
        help_text='Selecciona el tipo de usuario que deseas crear.',
        widget=forms.RadioSelect,
    )
    modulos = forms.MultipleChoiceField(
        choices=MODULO_CHOICES,
        required=False,
        widget=forms.CheckboxSelectMultiple,
        label='Módulos para supervisor',
        help_text='Selecciona qué módulos verá el rol Supervisor.',
    )
    change_password = forms.BooleanField(
        required=False,
        label='Cambiar contraseña',
        help_text='Activa esta opción solo si deseas definir una nueva contraseña.',
    )
    new_password = forms.CharField(
        required=False,
        label='Nueva contraseña',
        widget=forms.PasswordInput(render_value=False, attrs={'autocomplete': 'new-password'}),
        help_text='Se aplicará únicamente si activas "Cambiar contraseña".',
    )

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'rol', 'modulos', 'is_active']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Si el usuario ya existe, pre-cargar el rol según los flags
        if self.instance.pk:
            if self.instance.is_superuser:
                self.fields['rol'].initial = 'administrador'
            elif self.instance.is_staff:
                self.fields['rol'].initial = 'supervisor'
            else:
                self.fields['rol'].initial = 'tecnico'

            permissions = self.instance.user_permissions.select_related('content_type')
            initial_modulos = []
            if permissions.filter(
                content_type__app_label='api',
                content_type__model__in=[
                    'oficina',
                    'persona',
                    'oficinaequipo',
                    'solicitudreactivacioncontratista',
                    'equipo',
                ],
            ).exists():
                initial_modulos.append('oficina')
            if permissions.filter(
                content_type__app_label='inventario',
                content_type__model__in=['stockinventario', 'salidainventario'],
            ).exists():
                initial_modulos.append('inventario')
            if permissions.filter(
                content_type__app_label='otros',
                content_type__model__in=['equipootros', 'ticketotros', 'asignaciontareaotros'],
            ).exists() or permissions.filter(
                content_type__app_label='api',
                content_type__model='mascotafeedback',
            ).exists():
                initial_modulos.append('observaciones')
            self.fields['modulos'].initial = initial_modulos

            self.fields['change_password'].initial = False
            self.fields['new_password'].required = False
        else:
            self.fields['rol'].initial = 'tecnico'
            # En creación, la contraseña sí es obligatoria.
            self.fields['change_password'].initial = True
            self.fields['new_password'].required = True
            self.fields['change_password'].widget = forms.HiddenInput()
            self.fields['new_password'].help_text = 'Define la contraseña inicial del nuevo usuario.'
        self.fields['username'].required = True
        self.fields['first_name'].required = True
        self.fields['last_name'].required = True

    def save(self, commit=True):
        original_password = self.instance.password if self.instance and self.instance.pk else None
        user = super().save(commit=False)
        rol = self.cleaned_data.get('rol')
        change_password = self.cleaned_data.get('change_password')
        new_password = (self.cleaned_data.get('new_password') or '').strip()
        
        # Mapear rol a flags
        if rol == 'administrador':
            user.is_staff = True
            user.is_superuser = True
        elif rol == 'supervisor':
            user.is_staff = True
            user.is_superuser = False
        else:  # tecnico
            user.is_staff = False
            user.is_superuser = False

        # Cambiar contraseña solo cuando se solicita explícitamente.
        if not self.instance.pk or change_password:
            user.set_password(new_password)
        elif original_password:
            user.password = original_password
        
        if commit:
            user.save()
        return user

    def clean(self):
        cleaned = super().clean()
        rol = cleaned.get('rol')
        modulos = cleaned.get('modulos') or []
        new_password = (cleaned.get('new_password') or '').strip()
        change_password = bool(cleaned.get('change_password'))

        if rol == 'supervisor' and not modulos:
            self.add_error('modulos', 'Para rol Supervisor debes seleccionar al menos un módulo.')
        if self.instance and self.instance.pk:
            if change_password and not new_password:
                self.add_error('new_password', 'Escribe la nueva contraseña.')
            if not change_password:
                cleaned['new_password'] = ''
        else:
            if not new_password:
                self.add_error('new_password', 'La contraseña inicial es obligatoria.')
        return cleaned


# Personalizar admin de usuarios para mostrar permisos de forma más clara y corta
class CustomUserAdmin(BaseUserAdmin):
    form = CustomUserForm
    add_form = CustomUserForm
    actions = ['reset_passwords_to_temporary']
    
    class Media:
        css = {
            'all': ('admin/css/custom_permissions.css',)
        }
        js = ('admin/js/user_rol_modulos.js', 'admin/js/user_password_toggle.js')

    @staticmethod
    def _build_permissions_for_modules(modulos):
        modules_set = set(modulos or [])
        permissions_qs = Permission.objects.none()

        if 'oficina' in modules_set:
            permissions_qs = permissions_qs | Permission.objects.filter(
                content_type__app_label='api',
                content_type__model__in=[
                    'oficina',
                    'persona',
                    'oficinaequipo',
                    'solicitudreactivacioncontratista',
                    'equipo',
                ],
            )
        if 'inventario' in modules_set:
            permissions_qs = permissions_qs | Permission.objects.filter(
                content_type__app_label='inventario',
                content_type__model__in=['stockinventario', 'salidainventario'],
            )
        if 'observaciones' in modules_set:
            permissions_qs = permissions_qs | Permission.objects.filter(
                content_type__app_label='otros',
                content_type__model__in=['equipootros', 'ticketotros', 'asignaciontareaotros'],
            )
            permissions_qs = permissions_qs | Permission.objects.filter(
                content_type__app_label='api',
                content_type__model='mascotafeedback',
            )

        return permissions_qs.distinct()

    def get_fieldsets(self, request, obj=None):
        """Personalizar los fieldsets según si es creación o edición."""
        if obj is None:  # Creación nueva
            return (
                (None, {'fields': ('username', 'email', 'new_password')}),
                ('Información personal', {'fields': ('first_name', 'last_name')}),
                ('Rol', {'fields': ('rol', 'modulos')}),
                ('Estado', {'fields': ('is_active',)}),
            )
        else:  # Edición
            # En edición, mostrar más información pero el rol sigue siendo el controlador
            return (
                (None, {'fields': ('username', 'email', 'change_password', 'new_password')}),
                ('Información personal', {'fields': ('first_name', 'last_name')}),
                ('Rol', {
                    'fields': ('rol', 'modulos', 'is_active'),
                    'description': 'El "Rol" define el nivel de acceso del usuario.'
                }),
                ('Actividad', {'fields': ('last_login', 'date_joined'), 'classes': ('collapse',)}),
            )

    def save_model(self, request, obj, form, change):
        previous = None
        if change and obj.pk:
            previous = (
                User.objects.filter(pk=obj.pk)
                .values('email')
                .first()
            )
        super().save_model(request, obj, form, change)

        rol = form.cleaned_data.get('rol')
        modulos = form.cleaned_data.get('modulos') or []

        if rol == 'supervisor':
            obj.user_permissions.set(self._build_permissions_for_modules(modulos))
        elif rol == 'administrador':
            obj.user_permissions.set(self._build_permissions_for_modules([
                'oficina',
                'inventario',
                'observaciones',
            ]))
        else:
            obj.user_permissions.clear()

        if not change:
            role_labels = {
                'tecnico': 'Técnico',
                'supervisor': 'Supervisor',
                'administrador': 'Administrador',
            }
            notify_admin_created_user(obj, role_labels.get(rol, 'Usuario'))
        else:
            changed_fields = set(form.changed_data or [])
            updates: list[str] = []
            for field in sorted(changed_fields):
                if field in ('change_password',):
                    continue
                if field == 'new_password' and form.cleaned_data.get('change_password'):
                    updates.append('Se actualizó tu contraseña en el sistema.')
                    continue
                label = USER_FIELD_LABELS.get(field)
                if label:
                    updates.append(f'Se actualizó tu {label} en el sistema.')
                elif field == 'modulos':
                    updates.append('Se actualizó la configuración de tus módulos de acceso.')

            # Si cambió el correo, enviamos aviso al correo anterior y al nuevo.
            old_email = (previous or {}).get('email') if previous else None
            new_email = obj.email
            if updates:
                if is_valid_notification_email(old_email) and old_email != new_email:
                    _send_profile_update_email(
                        old_email,
                        'Actualización de tu cuenta en Sistema TIC',
                        obj.get_full_name() or obj.username,
                        updates,
                    )
                _send_profile_update_email(
                    new_email,
                    'Actualización de tu cuenta en Sistema TIC',
                    obj.get_full_name() or obj.username,
                    updates,
                )

    @admin.action(description='Restablecer contrasenia temporal para usuarios seleccionados')
    def reset_passwords_to_temporary(self, request, queryset):
        if not request.user.is_superuser:
            self.message_user(
                request,
                'Solo un superusuario puede restablecer contrasenias.',
                level=messages.ERROR,
            )
            return

        alphabet = string.ascii_letters + string.digits + '@#$%&*'
        generated = []
        for user in queryset:
            temp_password = ''.join(secrets.choice(alphabet) for _ in range(12))
            user.set_password(temp_password)
            user.save(update_fields=['password'])
            generated.append(f'{user.username}: {temp_password}')

        if generated:
            self.message_user(
                request,
                'Contrasenias temporales generadas. Entregalas por canal seguro: ' + ' | '.join(generated),
                level=messages.WARNING,
            )


# Desregistrar el UserAdmin por defecto y registrar el personalizado
admin.site.unregister(User)
admin.site.register(User, CustomUserAdmin)
admin.site.unregister(Group)


# ==================== PERSONALIZACIÓN DE MODELOS LOCALES ====================

class EquipoAdmin(admin.ModelAdmin):
    list_display = ['tipo', 'serie', 'marca', 'modelo', 'fecha_registro']
    search_fields = ['serie', 'marca']
    list_filter = ['tipo', 'fecha_registro']
    readonly_fields = ['fecha_registro']
    date_hierarchy = 'fecha_registro'


class TicketAdmin(admin.ModelAdmin):
    list_display = ['id', 'solicitante_nombre', 'solicitante_identificacion', 'equipo', 'estado', 'asignacion_disponible_display', 'fecha', 'fecha_limite_display', 'alerta_tiempo_display']
    list_filter = ['estado', 'fecha']
    search_fields = ['solicitante_nombre', 'solicitante_identificacion', 'equipo__serie']
    readonly_fields = ['fecha', 'fecha_limite_display', 'alerta_tiempo_display']
    date_hierarchy = 'fecha'

    def asignacion_disponible_display(self, obj):
        if obj.estado == 'CERRADO':
            return format_html('<span style="color:#c62828;font-weight:700;">Cerrado - no asignable</span>')
        if obj.asignado:
            return format_html('<span style="color:#ef6c00;font-weight:700;">Ya asignado</span>')
        return format_html('<span style="color:#2e7d32;font-weight:700;">Disponible</span>')

    asignacion_disponible_display.short_description = 'Estado de asignación'

    def fecha_limite_display(self, obj):
        if not obj or not obj.fecha_limite:
            return '-'
        return timezone.localtime(obj.fecha_limite).strftime('%Y-%m-%d %H:%M')

    fecha_limite_display.short_description = 'Fecha límite (10 días)'

    def alerta_tiempo_display(self, obj):
        if obj.estado == 'CERRADO':
            return format_html('<span style="color:#2e7d32;font-weight:600;">Sin alerta</span>')

        if obj.alerta_nivel == 'VENCIDO':
            return format_html(
                '<span style="color:#c62828;font-weight:700;">VENCIDO</span><br><small>{}</small>',
                obj.alerta_mensaje,
            )

        if obj.alerta_nivel == 'PROXIMO_A_VENCER':
            return format_html(
                '<span style="color:#ef6c00;font-weight:700;">POR VENCER</span><br><small>{}</small>',
                obj.alerta_mensaje,
            )

        return format_html('<span style="color:#2e7d32;font-weight:600;">En tiempo</span>')

    alerta_tiempo_display.short_description = 'Alerta por R'


class AsignacionTareaAdmin(admin.ModelAdmin):
    list_display = ['id', 'ticket', 'usuario_asignado', 'estado', 'prioridad_display', 'fecha_asignacion', 'plazo_hasta']
    list_filter = ['estado', 'prioridad', 'fecha_asignacion', 'fecha_finalizacion']
    search_fields = ['ticket__id', 'usuario_asignado__username']
    date_hierarchy = 'fecha_asignacion'

    def get_readonly_fields(self, request, obj=None):
        ro = ['fecha_asignacion']
        if obj:
            ro.append('fecha_finalizacion')
        return ro

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        if db_field.name == 'asignado_por':
            admin_users = (
                User.objects.filter(is_active=True)
                .filter(Q(is_staff=True) | Q(is_superuser=True))
                .order_by('username')
            )
            choices = [('', '---------')] + [
                (u.username, f'{u.get_full_name() or u.username} ({u.username})')
                for u in admin_users
            ]
            path = getattr(request, 'path', '') or ''
            is_add = '/add/' in path or path.rstrip('/').endswith('/add')
            initial = None
            if is_add and request.user.is_authenticated:
                un = request.user.username
                if any(c[0] == un for c in choices[1:]):
                    initial = un
            elif not is_add:
                oid = getattr(request, 'resolver_match', None) and request.resolver_match.kwargs.get(
                    'object_id'
                )
                if oid:
                    try:
                        aid = int(str(oid).strip('/'))
                        prev = (
                            self.model.objects.filter(pk=aid).values_list('asignado_por', flat=True).first()
                        )
                        if prev:
                            if not any(c[0] == prev for c in choices[1:]):
                                choices.append((prev, f'{prev} (valor guardado)'))
                            initial = prev
                    except (ValueError, TypeError):
                        pass
            return forms.ChoiceField(
                choices=choices,
                required=not db_field.blank,
                label=db_field.verbose_name,
                help_text='Solo usuarios administradores (staff o superusuario).',
                initial=initial,
            )
        return super().formfield_for_dbfield(db_field, request, **kwargs)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'ticket':
            base = Ticket.objects.order_by('-id')
            path = getattr(request, 'path', '') or ''
            is_add = '/add/' in path or path.rstrip('/').endswith('/add')
            if is_add:
                kwargs['queryset'] = base.filter(estado='ABIERTO')
            else:
                current_ticket_id = None
                oid = getattr(request, 'resolver_match', None) and request.resolver_match.kwargs.get(
                    'object_id'
                )
                if oid:
                    try:
                        aid = int(str(oid).strip('/'))
                        current_ticket_id = (
                            AsignacionTarea.objects.filter(pk=aid)
                            .values_list('ticket_id', flat=True)
                            .first()
                        )
                    except (ValueError, TypeError):
                        current_ticket_id = None
                if current_ticket_id:
                    kwargs['queryset'] = base.filter(Q(estado='ABIERTO') | Q(pk=current_ticket_id))
                else:
                    kwargs['queryset'] = base.filter(estado='ABIERTO')
        if db_field.name == 'usuario_asignado':
            kwargs['queryset'] = User.objects.filter(
                is_active=True,
                is_staff=False,
                is_superuser=False,
            ).order_by('username')
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def _handle_deleted_assignment(self, obj):
        if obj.ticket.estado != 'CERRADO' and obj.ticket.asignado:
            obj.ticket.asignado = False
            obj.ticket.save(update_fields=['asignado'])

    def get_fieldsets(self, request, obj=None):
        if obj is None:
            return (
                ('Asignación', {
                    'fields': (
                        'ticket',
                        'usuario_asignado',
                        'asignado_por',
                        'prioridad',
                        'plazo_hasta',
                    ),
                }),
                ('Observaciones', {
                    'fields': ('observaciones',),
                }),
            )

        return (
            ('Asignación', {
                'fields': (
                    'ticket',
                    'usuario_asignado',
                    'asignado_por',
                    'prioridad',
                    'plazo_hasta',
                ),
            }),
            ('Estado', {
                'fields': ('estado', 'fecha_asignacion', 'fecha_finalizacion'),
            }),
            ('Observaciones', {
                'fields': ('observaciones',),
            }),
        )

    def save_model(self, request, obj, form, change):
        """Cuando se guarda desde admin, aplicar lógica de bloqueo."""
        if not change:
            if obj.ticket.estado == 'CERRADO':
                messages.error(request, 'No se puede asignar un ticket que ya esta cerrado.')
                return
            if obj.ticket.estado != 'ABIERTO':
                messages.error(request, 'Solo se pueden asignar tickets en estado abierto.')
                return

            if obj.ticket.asignado:
                messages.error(request, "Este ticket ya está asignado a otra persona.")
                return

            obj.ticket.asignado = True
            obj.ticket.save()

            obj.asignado_por = (obj.asignado_por or request.user.username).strip()
            obj.estado = 'PENDIENTE'

        super().save_model(request, obj, form, change)

        updates = []

        if obj.estado == 'FINALIZADA':
            if obj.fecha_finalizacion is None:
                obj.fecha_finalizacion = timezone.now()
                obj.save(update_fields=['fecha_finalizacion'])
            if obj.ticket.estado != 'CERRADO':
                obj.ticket.estado = 'CERRADO'
                updates.append('estado')
            if not obj.ticket.asignado:
                obj.ticket.asignado = True
                updates.append('asignado')

        if updates:
            obj.ticket.save(update_fields=updates)

    def prioridad_display(self, obj):
        return obj.get_prioridad_display()
    prioridad_display.short_description = 'Prioridad'

    def delete_model(self, request, obj):
        self._handle_deleted_assignment(obj)
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset.select_related('ticket'):
            self._handle_deleted_assignment(obj)
        super().delete_queryset(request, queryset)


class OficinaAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'codigo', 'fecha_registro', 'sticker_download_link', 'activa']
    list_filter = ['activa', 'fecha_registro']
    search_fields = ['nombre', 'codigo']
    readonly_fields = ['fecha_registro', 'qr_payload_display', 'qr_download_link', 'sticker_download_link', 'qr_preview']

    def get_fields(self, request, obj=None):
        fields = ['nombre', 'descripcion', 'activa', 'fecha_registro', 'qr_payload_display', 'qr_download_link', 'sticker_download_link', 'qr_preview']
        if obj:
            return ['nombre', 'codigo', 'descripcion', 'activa', 'fecha_registro', 'qr_payload_display', 'qr_download_link', 'sticker_download_link', 'qr_preview']
        return fields

    def get_readonly_fields(self, request, obj=None):
        base = ['fecha_registro', 'qr_payload_display', 'qr_download_link', 'sticker_download_link', 'qr_preview']
        if obj:
            return ['codigo'] + base
        return base

    def qr_payload_display(self, obj):
        return obj.qr_payload

    qr_payload_display.short_description = 'Payload QR'

    def qr_preview(self, obj):
        if not obj.pk:
            return 'Guarda la oficina para generar QR.'
        return format_html(
            '<div style="text-align:center;">'
            '<img src="{}" alt="QR {}" style="height:170px;width:170px;border:1px solid #d6f4dc;border-radius:16px;padding:8px;background:#fff;"/>'
            '<p style="margin-top:8px;font-weight:700;color:#0f7f43;">{}</p>'
            '</div>',
            obj.qr_image_url,
            obj.nombre,
            obj.nombre,
        )

    qr_preview.short_description = 'QR de Oficina'

    def qr_download_link(self, obj):
        if not obj.pk:
            return '-'
        return format_html(
            '<a class="button" href="/api/oficinas/{}/qr-descargar/" target="_blank">Descargar QR PNG</a>',
            obj.id,
        )

    qr_download_link.short_description = 'Descargar QR'

    def sticker_download_link(self, obj):
        if not obj.pk:
            return '-'
        return format_html(
            '<a class="button" href="/api/oficinas/{}/sticker-descargar/" target="_blank" '
            'style="background:linear-gradient(180deg,#1fb45a 0%,#128342 100%);border-color:#128342;color:#fff;">Descargar QR</a>',
            obj.id,
        )

    sticker_download_link.short_description = 'Descargar QR'


class PersonaAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'identificacion', 'tipo', 'oficina', 'activo', 'vigente_display']
    list_filter = ['tipo', 'activo', 'oficina']
    search_fields = ['nombre', 'identificacion', 'correo']
    readonly_fields = ['fecha_registro', 'vigente_display', 'estado_activo_display']

    class Media:
        js = ('admin/js/persona_admin.js',)

    fieldsets = (
        ('Datos principales', {
            'fields': ('oficina', 'tipo', 'nombre', 'identificacion', 'correo', 'telefono', 'activo', 'fecha_registro')
        }),
        ('Vigencia (solo contratista)', {
            'fields': ('fecha_inicio', 'fecha_fin')
        }),
        ('Estado', {
            'fields': ('vigente_display', 'estado_activo_display')
        }),
    )

    def vigente_display(self, obj):
        if obj.tipo == 'FUNCIONARIO':
            return '—'
        return 'Sí' if obj.vigente else 'No'

    vigente_display.short_description = 'Vigente (contratista)'

    def estado_activo_display(self, obj):
        return 'Sí' if obj.estado_activo else 'No'

    estado_activo_display.short_description = 'Estado activo'

    def save_model(self, request, obj, form, change):
        is_new = not change
        previous = None
        if change and obj.pk:
            previous = (
                Persona.objects.filter(pk=obj.pk)
                .select_related('oficina')
                .first()
            )
        if obj.tipo == 'FUNCIONARIO':
            obj.fecha_inicio = None
            obj.fecha_fin = None
        elif obj.tipo == 'CONTRATISTA' and obj.fecha_fin and obj.fecha_fin < timezone.localdate():
            # Si el contrato ya venció, desactivar automáticamente el perfil.
            obj.activo = False
        super().save_model(request, obj, form, change)
        if is_new:
            notify_admin_created_persona(obj)
        else:
            changed_fields = set(form.changed_data or [])
            updates: list[str] = []
            for field in sorted(changed_fields):
                label = PERSONA_FIELD_LABELS.get(field)
                if not label:
                    continue
                if field == 'tipo':
                    updates.append(f'Se actualizó tu {label} en el sistema.')
                elif field == 'oficina':
                    oficina_name = obj.oficina.nombre if obj.oficina else 'sin oficina'
                    updates.append(f'Se actualizó tu {label} en el sistema: ahora estás en {oficina_name}.')
                elif field == 'fecha_fin' and obj.tipo == 'CONTRATISTA':
                    fin_text = obj.fecha_fin.strftime('%d/%m/%Y') if obj.fecha_fin else 'sin fecha definida'
                    updates.append(f'Se actualizó tu fecha de terminación: {fin_text}.')
                elif field == 'activo':
                    updates.append(
                        'Se actualizó tu estado en el sistema: '
                        + ('activo.' if obj.activo else 'inactivo.')
                    )
                else:
                    updates.append(f'Se actualizó tu {label} en el sistema.')

            # Si el correo cambió, avisar al correo anterior y al nuevo.
            old_email = previous.correo if previous else ''
            new_email = obj.correo
            if updates:
                if is_valid_notification_email(old_email) and old_email != new_email:
                    _send_profile_update_email(
                        old_email,
                        'Actualización de tus datos en Sistema TIC',
                        obj.nombre,
                        updates,
                    )
                _send_profile_update_email(
                    new_email,
                    'Actualización de tus datos en Sistema TIC',
                    obj.nombre,
                    updates,
                )

            # Si quedó desactivado por vencimiento de contrato, avisar al contratista.
            was_active = previous.activo if previous else True
            if (
                was_active
                and not obj.activo
                and obj.tipo == 'CONTRATISTA'
                and not obj.vigente
            ):
                notify_contractor_expired(obj)


class OficinaEquipoAdminForm(forms.ModelForm):
    class Meta:
        model = OficinaEquipo
        exclude = ('tipo_persona',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        equipo_field = self.fields.get('equipo')
        if equipo_field:
            equipo_field.label = 'Inventario'
            # Mostrar solo equipos disponibles (sin asignación activa).
            # En edición se conserva visible el equipo actual del registro.
            active_assignments = OficinaEquipo.objects.filter(activo=True)
            if self.instance and self.instance.pk:
                active_assignments = active_assignments.exclude(pk=self.instance.pk)
                current_equipo_id = self.instance.equipo_id
            else:
                current_equipo_id = None

            taken_equipo_ids = list(
                active_assignments.values_list('equipo_id', flat=True).distinct()
            )
            available_qs = Equipo.objects.exclude(pk__in=taken_equipo_ids).order_by('tipo', 'serie')
            if current_equipo_id:
                available_qs = Equipo.objects.filter(
                    Q(pk=current_equipo_id) | Q(pk__in=available_qs.values('pk'))
                ).order_by('tipo', 'serie')
            equipo_field.queryset = available_qs

        persona_field = self.fields.get('persona')
        if not persona_field:
            return

        persona_field.required = True
        persona_field.error_messages['required'] = 'Debes asignar una persona para este equipo.'

        # Start empty; JS will load by selected office in real time.
        persona_field.queryset = Persona.objects.none()

        oficina_id = None
        if self.is_bound:
            oficina_id = self.data.get('oficina')
        elif self.instance and self.instance.pk:
            oficina_id = self.instance.oficina_id

        if oficina_id:
            persona_field.queryset = Persona.objects.filter(oficina_id=oficina_id, activo=True).order_by('nombre')

    def clean(self):
        cleaned = super().clean()
        oficina = cleaned.get('oficina')
        persona = cleaned.get('persona')

        if not persona:
            self.add_error('persona', 'Debes asignar una persona para este equipo.')
            # Keep model validation coherent even before save_model runs.
            self.instance.tipo_persona = 'SIN_ASIGNAR'
            return cleaned

        # Critical: model.clean runs during form validation, before admin.save_model.
        # If we don't set this now, model.clean sees SIN_ASIGNAR + persona and raises error.
        self.instance.tipo_persona = persona.tipo

        if persona and oficina and persona.oficina_id != oficina.id:
            self.add_error('persona', 'La persona seleccionada no pertenece a la oficina elegida.')

        return cleaned


class OficinaEquipoAdmin(admin.ModelAdmin):
    form = OficinaEquipoAdminForm
    list_display = ['oficina_nombre', 'equipo_nombre', 'equipo_serie', 'tipo_persona', 'persona_nombre', 'activo']
    list_filter = ['oficina', 'tipo_persona', 'activo']
    search_fields = ['oficina__nombre', 'equipo__tipo', 'equipo__serie', 'persona__nombre', 'persona__identificacion']

    def oficina_nombre(self, obj):
        return obj.oficina.nombre

    oficina_nombre.short_description = 'Oficina'
    oficina_nombre.admin_order_field = 'oficina__nombre'

    def equipo_nombre(self, obj):
        return obj.equipo.tipo

    equipo_nombre.short_description = 'Equipo'
    equipo_nombre.admin_order_field = 'equipo__tipo'

    def equipo_serie(self, obj):
        return obj.equipo.serie

    equipo_serie.short_description = 'Serie del Equipo'
    equipo_serie.admin_order_field = 'equipo__serie'

    def persona_nombre(self, obj):
        return obj.persona.nombre if obj.persona else '-'

    persona_nombre.short_description = 'Persona'
    persona_nombre.admin_order_field = 'persona__nombre'

    def get_urls(self):
        info = self.model._meta.app_label, self.model._meta.model_name
        custom_urls = [
            path(
                'personas-por-oficina/',
                self.admin_site.admin_view(self.personas_por_oficina_view),
                name='%s_%s_personas_por_oficina' % info,
            ),
        ]
        return custom_urls + super().get_urls()

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
        if db_field.name == 'persona':
            url_name = 'admin:%s_%s_personas_por_oficina' % (self.model._meta.app_label, self.model._meta.model_name)
            formfield.widget.attrs['data-personas-url'] = reverse(url_name)
        return formfield

    def personas_por_oficina_view(self, request):
        oficina_id = (request.GET.get('oficina') or '').strip()
        if not oficina_id:
            return JsonResponse({'results': []})

        personas = Persona.objects.filter(oficina_id=oficina_id, activo=True).order_by('nombre')
        results = [
            {
                'id': p.id,
                'label': f'{p.nombre} - {p.identificacion} ({p.get_tipo_display()})',
            }
            for p in personas
        ]
        return JsonResponse({'results': results})

    def get_fields(self, request, obj=None):
        return ['oficina', 'equipo', 'persona', 'activo']

    def save_model(self, request, obj, form, change):
        if obj.persona:
            obj.tipo_persona = obj.persona.tipo
        else:
            obj.tipo_persona = 'SIN_ASIGNAR'
        super().save_model(request, obj, form, change)

    def add_view(self, request, form_url='', extra_context=None):
        context = {'title': 'Asignar equipo'}
        if extra_context:
            context.update(extra_context)
        return super().add_view(request, form_url=form_url, extra_context=context)

    class Media:
        js = ('admin/js/oficina_equipo_admin_v3.js',)


class SolicitudReactivacionContratistaAdmin(admin.ModelAdmin):
    list_display = ['persona_info', 'estado', 'fecha_vigencia_display', 'motivo_preview', 'fecha']
    list_filter = ['estado', 'fecha', 'persona__tipo']
    search_fields = ['persona__nombre', 'persona__identificacion', 'motivo']
    readonly_fields = ['fecha', 'persona', 'motivo']
    date_hierarchy = 'fecha'
    actions = ['aprobar_solicitud', 'rechazar_solicitud']

    fieldsets = (
        ('Información de la Solicitud', {
            'fields': ('persona', 'fecha', 'estado', 'fecha_nueva_vigencia')
        }),
        ('Motivo de Reactivación', {
            'fields': ('motivo',),
            'classes': ('collapse',)
        }),
    )

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if obj and obj.estado == 'APROBADA':
            form.base_fields['fecha_nueva_vigencia'].required = True
        return form

    def persona_info(self, obj):
        if obj.persona:
            return f"{obj.persona.nombre} ({obj.persona.identificacion})"
        return "N/A"
    persona_info.short_description = "Persona"

    def motivo_preview(self, obj):
        if obj.motivo:
            preview = obj.motivo[:50]
            if len(obj.motivo) > 50:
                preview += "..."
            return preview
        return "-"
    motivo_preview.short_description = "Motivo"

    def fecha_vigencia_display(self, obj):
        if obj.fecha_nueva_vigencia:
            return obj.fecha_nueva_vigencia.strftime('%d/%m/%Y')
        return "-"
    fecha_vigencia_display.short_description = "Vigencia Hasta"

    @admin.action(description="✅ Aprobar solicitudes seleccionadas")
    def aprobar_solicitud(self, request, queryset):
        updated = queryset.update(estado='APROBADA')
        self.message_user(request, f'{updated} solicitud(es) aprobada(s) correctamente.')

    @admin.action(description="❌ Rechazar solicitudes seleccionadas")
    def rechazar_solicitud(self, request, queryset):
        updated = queryset.update(estado='RECHAZADA')
        self.message_user(request, f'{updated} solicitud(es) rechazada(s).')

    def save_model(self, request, obj, form, change):
        if obj.estado == 'APROBADA' and obj.fecha_nueva_vigencia and obj.persona:
            obj.persona.fecha_fin = obj.fecha_nueva_vigencia
            obj.persona.activo = True
            obj.persona.save(update_fields=['fecha_fin', 'activo'])
            notify_contractor_renewed_to_admin(obj.persona, renewed_by=getattr(request.user, 'username', ''))
        super().save_model(request, obj, form, change)


class MascotaFeedbackAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'oficina', 'fecha']
    search_fields = ['nombre', 'oficina', 'mejora']
    list_filter = ['fecha', 'oficina']
    readonly_fields = ['fecha']
    date_hierarchy = 'fecha'
    fieldsets = (
        ('Datos del remitente', {
            'fields': ('nombre', 'oficina', 'fecha')
        }),
        ('Sugerencia de mejora', {
            'fields': ('mejora',)
        }),
    )


admin.site.register(Oficina, OficinaAdmin)
admin.site.register(Persona, PersonaAdmin)
admin.site.register(OficinaEquipo, OficinaEquipoAdmin)
admin.site.register(SolicitudReactivacionContratista, SolicitudReactivacionContratistaAdmin)
admin.site.register(Equipo, EquipoAdmin)
admin.site.register(Ticket, TicketAdmin)
admin.site.register(AsignacionTarea, AsignacionTareaAdmin)
admin.site.register(MascotaFeedback, MascotaFeedbackAdmin)
