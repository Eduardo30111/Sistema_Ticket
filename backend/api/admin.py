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

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'password', 'rol', 'modulos', 'is_active']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        password_field = self.fields.get('password')
        if password_field:
            password_field.widget = forms.PasswordInput(render_value=False)

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

            if password_field:
                password_field.required = False
                password_field.help_text = 'Deja este campo vacio para mantener la contrasenia actual.'
        else:
            self.fields['rol'].initial = 'tecnico'
            if password_field:
                password_field.required = True
        self.fields['username'].required = True
        self.fields['first_name'].required = True
        self.fields['last_name'].required = True

    def save(self, commit=True):
        original_password = self.instance.password if self.instance and self.instance.pk else None
        user = super().save(commit=False)
        rol = self.cleaned_data.get('rol')
        password = self.cleaned_data.get('password')
        
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

        # Guardar password usando hash de Django.
        if password:
            user.set_password(password)
        elif original_password:
            user.password = original_password
        
        if commit:
            user.save()
        return user

    def clean(self):
        cleaned = super().clean()
        rol = cleaned.get('rol')
        modulos = cleaned.get('modulos') or []
        if rol == 'supervisor' and not modulos:
            self.add_error('modulos', 'Para rol Supervisor debes seleccionar al menos un módulo.')
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
        js = ('admin/js/user_rol_modulos.js',)

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
                (None, {'fields': ('username', 'email', 'password')}),
                ('Información personal', {'fields': ('first_name', 'last_name')}),
                ('Rol', {'fields': ('rol', 'modulos')}),
                ('Estado', {'fields': ('is_active',)}),
            )
        else:  # Edición
            # En edición, mostrar más información pero el rol sigue siendo el controlador
            return (
                (None, {'fields': ('username', 'email', 'password')}),
                ('Información personal', {'fields': ('first_name', 'last_name')}),
                ('Rol', {
                    'fields': ('rol', 'modulos', 'is_active'),
                    'description': 'El "Rol" define el nivel de acceso del usuario.'
                }),
                ('Actividad', {'fields': ('last_login', 'date_joined'), 'classes': ('collapse',)}),
            )

    def save_model(self, request, obj, form, change):
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
        if obj.tipo == 'FUNCIONARIO':
            obj.fecha_inicio = None
            obj.fecha_fin = None
        super().save_model(request, obj, form, change)


class OficinaEquipoAdminForm(forms.ModelForm):
    class Meta:
        model = OficinaEquipo
        exclude = ('tipo_persona',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        equipo_field = self.fields.get('equipo')
        if equipo_field:
            equipo_field.label = 'Inventario'

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
